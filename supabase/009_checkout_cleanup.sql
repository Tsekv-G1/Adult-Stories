-- Simpler transfer note: use only the member's last eight phone digits.
-- Customer payment reports no longer ask for a bank receipt/reference.
-- Apply after 008_audio_workflow.sql (or after 007 on older installs without 008).
begin;

update public.adult_payment_orders o
set memo=right(regexp_replace(m.phone,'[^0-9]','','g'),8)
from public.adult_members m
where o.member_id=m.id and o.status='pending';

create or replace function public.adult_create_order(
  p_member_id uuid,p_kind text,p_story_id uuid,p_client_id uuid,p_membership_days integer default 30
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.adult_payment_orders;cost integer;published_at timestamptz;member_phone text;phone_digits text;days integer;
begin
 select phone into member_phone from public.adult_members where id=p_member_id and status='active' for update;
 if not found then raise exception 'account_inactive';end if;
 phone_digits:=right(regexp_replace(coalesce(member_phone,''),'[^0-9]','','g'),8);
 days:=case when p_kind='membership' then coalesce(p_membership_days,30) else null end;
 if (p_kind='membership' and (p_story_id is not null or days not in (7,30))) or
    (p_kind='story' and (p_story_id is null or p_membership_days is not null)) then raise exception 'invalid_order';end if;
 select * into o from public.adult_payment_orders where member_id=p_member_id and client_id=p_client_id;
 if found then
  if o.kind<>p_kind or o.story_id is distinct from p_story_id or o.membership_days is distinct from days then raise exception 'invalid_order';end if;
  return to_jsonb(o);
 end if;
 if p_kind='story' then
  select price,publish_at into cost,published_at from public.stories where id=p_story_id and status='published';
  if not found or published_at>now() then raise exception 'story_unavailable';end if;
 elsif p_kind='membership' then
  if days=7 then select coalesce((content->>'membership_week_price')::integer,9900) into cost from public.site_settings where id='main';
  else select coalesce((content->>'membership_price')::integer,29900) into cost from public.site_settings where id='main';end if;
 else raise exception 'invalid_order';end if;
 if cost is null or cost<=0 then raise exception 'invalid_order';end if;
 select * into o from public.adult_payment_orders where member_id=p_member_id and kind=p_kind
  and story_id is not distinct from p_story_id and membership_days is not distinct from days and status='pending'
  order by created_at desc limit 1;
 if found then return to_jsonb(o);end if;
 insert into public.adult_payment_orders(member_id,client_id,kind,story_id,membership_days,amount,memo)
  values(p_member_id,p_client_id,p_kind,p_story_id,days,cost,phone_digits) returning * into o;
 return to_jsonb(o);
end $$;

create or replace function public.adult_decide_order(
 p_order_id uuid,p_approve boolean,p_receipt text,p_note text,p_actor text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.adult_payment_orders;expiry timestamptz;receipt text;
begin
 if length(trim(p_note))<5 or length(p_note)>500 then raise exception 'verification_note_required';end if;
 receipt:=upper(regexp_replace(coalesce(p_receipt,''),'\s','','g'));
 if p_approve and receipt<>'' and length(receipt)<4 then raise exception 'invalid_bank_reference';end if;
 select * into o from public.adult_payment_orders where id=p_order_id for update;
 if not found then raise exception 'invalid_order';end if;
 if o.status='approved' and p_approve then return to_jsonb(o);end if;
 if o.status<>'pending' then raise exception 'order_not_pending';end if;
 if p_approve then
  if receipt<>'' and exists(select 1 from public.adult_payment_orders where bank_reference=receipt and id<>o.id) then raise exception 'receipt_already_used';end if;
  if o.kind='membership' then
   perform 1 from public.adult_members where id=o.member_id for update;
   select greatest(now(),coalesce(max(expires_at),now()))+make_interval(days=>o.membership_days) into expiry
    from public.adult_entitlements where member_id=o.member_id and story_id is null and revoked_at is null;
  else expiry:=null;end if;
  update public.adult_payment_orders set status='approved',bank_reference=nullif(receipt,''),decided_at=now() where id=o.id returning * into o;
  insert into public.adult_entitlements(member_id,story_id,order_id,expires_at,membership_days)
   values(o.member_id,o.story_id,o.id,expiry,o.membership_days);
 else
  update public.adult_payment_orders set status='rejected',decided_at=now() where id=o.id returning * into o;
 end if;
 insert into public.adult_audit(actor,action,order_id,note)
  values(p_actor,case when p_approve then 'approve' else 'reject' end,o.id,p_note);
 return to_jsonb(o);
exception when unique_violation then raise exception 'receipt_already_used';
end $$;

revoke all on function public.adult_create_order(uuid,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.adult_create_order(uuid,text,uuid,uuid,integer) to service_role;
revoke all on function public.adult_decide_order(uuid,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.adult_decide_order(uuid,boolean,text,text,text) to service_role;

commit;
