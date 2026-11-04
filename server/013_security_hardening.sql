-- Adult Stories v4: idempotent, server-only billing tables hardening.
-- Apply AFTER 012_audio_crop_jobs.sql. Keep story_private admin CMS permissions unchanged.
begin;

alter table public.adult_members enable row level security;
alter table public.adult_sessions enable row level security;
alter table public.adult_payment_orders enable row level security;
alter table public.adult_entitlements enable row level security;
alter table public.adult_audit enable row level security;
alter table public.adult_rate_limits enable row level security;
alter table public.adult_first_purchase_redemptions enable row level security;
alter table public.story_private enable row level security;
alter table public.adult_audio_crop_jobs enable row level security;

-- Customer auth is an HttpOnly session handled only by Netlify (service_role).
-- Never expose member hashes, orders, rights or the background job queue via anon keys.
revoke all on public.adult_members, public.adult_sessions,
 public.adult_payment_orders, public.adult_entitlements, public.adult_audit,
 public.adult_rate_limits, public.adult_first_purchase_redemptions,
 public.adult_audio_crop_jobs from public, anon, authenticated;

grant select,insert,update,delete on public.adult_members, public.adult_sessions,
 public.adult_payment_orders, public.adult_entitlements, public.adult_audit,
 public.adult_rate_limits, public.adult_first_purchase_redemptions,
 public.adult_audio_crop_jobs to service_role;

-- These helpers must only be invoked from trusted server-side credentials.
revoke all on function public.adult_take_rate(text,integer,integer) from public,anon,authenticated;
revoke all on function public.adult_create_order(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.adult_create_order(uuid,text,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.adult_decide_order(uuid,boolean,text,text,text) from public,anon,authenticated;
revoke all on function public.adult_revoke_entitlement(uuid,text,text) from public,anon,authenticated;


-- Repair the payment-decision function shipped by 011_first_purchase_offer.sql.
-- That migration's approval branch referenced an undeclared list_cost variable.
-- The approval remains a trusted service-role RPC, with a member-level lock.
create or replace function public.adult_decide_order(
 p_order_id uuid,p_approve boolean,p_receipt text,p_note text,p_actor text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 o public.adult_payment_orders;
 expiry timestamptz;
 receipt text;
 audit_note text;
 v_constraint_name text;
begin
 receipt := upper(regexp_replace(coalesce(p_receipt,''),'\s','','g'));
 audit_note := coalesce(nullif(trim(p_note),''),case when p_approve then 'Админ төлбөрийг баталсан.' else 'Админ төлбөрийг цуцалсан.' end);
 if length(audit_note)<5 or length(audit_note)>500 then raise exception 'verification_note_required';end if;
 if p_approve and receipt<>'' and length(receipt)<4 then raise exception 'invalid_bank_reference';end if;
 select * into o from public.adult_payment_orders where id=p_order_id for update;
 if not found then raise exception 'invalid_order';end if;
 if o.status='approved' and p_approve then return to_jsonb(o);end if;
 if o.status<>'pending' then raise exception 'order_not_pending';end if;
 if p_approve then
  perform 1 from public.adult_members where id=o.member_id for update;
  if o.first_purchase_offer and exists(
   select 1 from public.adult_first_purchase_redemptions
   where member_id=o.member_id and order_id<>o.id
  ) then raise exception 'first_purchase_offer_used';end if;
  if receipt<>'' and exists(
   select 1 from public.adult_payment_orders
   where bank_reference=receipt and id<>o.id
  ) then raise exception 'receipt_already_used';end if;
  if o.kind='membership' then
   select greatest(now(),coalesce(max(expires_at),now()))+make_interval(days=>o.membership_days)
    into expiry from public.adult_entitlements
    where member_id=o.member_id and story_id is null and revoked_at is null;
  else expiry:=null;end if;
  update public.adult_payment_orders
   set status='approved',bank_reference=nullif(receipt,''),decided_at=now()
   where id=o.id returning * into o;
  insert into public.adult_entitlements(member_id,story_id,order_id,expires_at,membership_days)
   values(o.member_id,o.story_id,o.id,expiry,o.membership_days);
  insert into public.adult_first_purchase_redemptions(member_id,order_id)
   values(o.member_id,o.id) on conflict(member_id) do nothing;
 else
  update public.adult_payment_orders set status='rejected',decided_at=now()
   where id=o.id returning * into o;
 end if;
 insert into public.adult_audit(actor,action,order_id,note)
  values(p_actor,case when p_approve then 'approve' else 'reject' end,o.id,audit_note);
 return to_jsonb(o);
exception when unique_violation then
 get stacked diagnostics v_constraint_name=CONSTRAINT_NAME;
 if v_constraint_name='adult_payment_orders_bank_reference_key' then
  raise exception 'receipt_already_used';
 end if;
 raise exception 'first_purchase_offer_used';
end $$;
revoke all on function public.adult_decide_order(uuid,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.adult_decide_order(uuid,boolean,text,text,text) to service_role;

commit;

-- Audit BEFORE switching a paid catalog to private-only playback:
-- select s.id,s.title,p.full_audio_url from public.stories s
-- join public.story_private p on p.story_id=s.id
-- where s.price>0 and p.full_audio_url<>''
--   and p.full_audio_url not like '%r2.cloudflarestorage.com/%'
--   and p.full_audio_url not like '%/storage/v1/object/authenticated/adult-audio/%';
-- This is a discovery query, not proof that a URL is protected.
-- Move each legacy public original into R2_AUDIO_BUCKET and update story_private.
