-- One-time introductory membership price. Apply after 005_membership_passes.sql
-- (after 007_story_series.sql if that migration is installed).
-- First-time eligibility is recorded only after any payment is approved.
begin;

alter table public.adult_payment_orders
  add column if not exists first_purchase_offer boolean not null default false;

create table if not exists public.adult_first_purchase_redemptions (
  member_id uuid primary key references public.adult_members(id) on delete cascade,
  order_id uuid not null unique references public.adult_payment_orders(id),
  redeemed_at timestamptz not null default now()
);
alter table public.adult_first_purchase_redemptions enable row level security;
revoke all on public.adult_first_purchase_redemptions from public,anon,authenticated;
grant all on public.adult_first_purchase_redemptions to service_role;

-- Clean up older pending transfer memos so they contain only the member's local number.
update public.adult_payment_orders o
set memo=right(regexp_replace(m.phone,'[^0-9]','','g'),8)
from public.adult_members m
where o.member_id=m.id and o.status='pending';

-- Preserve prior customers as already having used their first-purchase offer.
insert into public.adult_first_purchase_redemptions(member_id,order_id,redeemed_at)
select distinct on (member_id) member_id,id,coalesce(decided_at,created_at)
from public.adult_payment_orders
where status='approved'
order by member_id,coalesce(decided_at,created_at),created_at,id
on conflict(member_id) do nothing;

update public.site_settings
set content=jsonb_set(
  jsonb_set(content,'{membership_first_price}',coalesce(content->'membership_first_price','24900'::jsonb),true),
  '{membership_price}',coalesce(content->'membership_price','29900'::jsonb),true)
where id='main';

create or replace function public.adult_create_order(
  p_member_id uuid,p_kind text,p_story_id uuid,p_client_id uuid,p_membership_days integer default 30
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  o public.adult_payment_orders;
  cost integer;
  published_at timestamptz;
  member_phone text;
  phone_digits text;
  days integer;
  first_purchase boolean;
  intro_offer boolean:=false;
begin
  select phone into member_phone from public.adult_members
   where id=p_member_id and status='active' for update;
  if not found then raise exception 'account_inactive';end if;
  phone_digits:=right(regexp_replace(coalesce(member_phone,''),'[^0-9]','','g'),8);
  days:=case when p_kind='membership' then coalesce(p_membership_days,30) else null end;
  if (p_kind='membership' and (p_story_id is not null or days not in (7,30))) or
     (p_kind='story' and (p_story_id is null or p_membership_days is not null)) then raise exception 'invalid_order';end if;

  select not exists(select 1 from public.adult_first_purchase_redemptions where member_id=p_member_id)
    and not exists(select 1 from public.adult_payment_orders where member_id=p_member_id and status='approved')
    into first_purchase;
  if p_kind='story' then
    select price,publish_at into cost,published_at from public.stories where id=p_story_id and status='published';
    if not found or published_at>now() then raise exception 'story_unavailable';end if;
  elsif p_kind='membership' then
    if days=7 then
      select coalesce((content->>'membership_week_price')::integer,9900) into cost from public.site_settings where id='main';
    elsif first_purchase then
      select coalesce((content->>'membership_first_price')::integer,24900) into cost from public.site_settings where id='main';
      intro_offer:=true;
    else
      select coalesce((content->>'membership_price')::integer,29900) into cost from public.site_settings where id='main';
    end if;
  else raise exception 'invalid_order';end if;
  if cost is null or cost<=0 then raise exception 'invalid_order';end if;

  select * into o from public.adult_payment_orders where member_id=p_member_id and client_id=p_client_id;
  if found then
    if o.kind<>p_kind or o.story_id is distinct from p_story_id or o.membership_days is distinct from days then raise exception 'invalid_order';end if;
    if o.status='pending' and (o.amount<>cost or o.first_purchase_offer<>intro_offer) then
      update public.adult_payment_orders set amount=cost,first_purchase_offer=intro_offer where id=o.id returning * into o;
    end if;
    return to_jsonb(o);
  end if;
  select * into o from public.adult_payment_orders where member_id=p_member_id and kind=p_kind
   and story_id is not distinct from p_story_id and membership_days is not distinct from days and status='pending'
   order by created_at desc limit 1;
  if found then
    if o.amount<>cost or o.first_purchase_offer<>intro_offer then
      update public.adult_payment_orders set amount=cost,first_purchase_offer=intro_offer where id=o.id returning * into o;
    end if;
    return to_jsonb(o);
  end if;
  insert into public.adult_payment_orders(member_id,client_id,kind,story_id,membership_days,amount,memo,first_purchase_offer)
   values(p_member_id,p_client_id,p_kind,p_story_id,days,cost,phone_digits,intro_offer) returning * into o;
  return to_jsonb(o);
end $$;

create or replace function public.adult_decide_order(
  p_order_id uuid,p_approve boolean,p_receipt text,p_note text,p_actor text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.adult_payment_orders;expiry timestamptz;receipt text;audit_note text;v_constraint_name text;
begin
  receipt:=upper(regexp_replace(coalesce(p_receipt,''),'\s','','g'));
  audit_note:=coalesce(nullif(trim(p_note),''),case when p_approve then 'Админ төлбөрийг баталсан.' else 'Админ төлбөрийг цуцалсан.' end);
  if length(audit_note)>500 then raise exception 'verification_note_required';end if;
  if p_approve and receipt<>'' and length(receipt)<4 then raise exception 'invalid_bank_reference';end if;
  select * into o from public.adult_payment_orders where id=p_order_id for update;
  if not found then raise exception 'invalid_order';end if;
  if o.status='approved' and p_approve then return to_jsonb(o);end if;
  if o.status<>'pending' then raise exception 'order_not_pending';end if;
  if p_approve then
    -- Serialize approvals per customer so two concurrent orders cannot both consume the offer.
    perform 1 from public.adult_members where id=o.member_id for update;
    if o.first_purchase_offer and exists(select 1 from public.adult_first_purchase_redemptions where member_id=o.member_id and order_id<>o.id) then
      raise exception 'first_purchase_offer_used';
    end if;
    if receipt<>'' and exists(select 1 from public.adult_payment_orders where bank_reference=receipt and id<>o.id) then raise exception 'receipt_already_used';end if;
    if o.kind='membership' then
      select greatest(now(),coalesce(max(expires_at),now()))+make_interval(days=>o.membership_days) into expiry
       from public.adult_entitlements where member_id=o.member_id and story_id is null and revoked_at is null;
    else expiry:=null;end if;
    update public.adult_payment_orders set status='approved',bank_reference=nullif(receipt,''),decided_at=now() where id=o.id returning * into o;
    insert into public.adult_entitlements(member_id,story_id,order_id,expires_at,membership_days)
      values(o.member_id,o.story_id,o.id,expiry,o.membership_days);
    insert into public.adult_first_purchase_redemptions(member_id,order_id)
      values(o.member_id,o.id) on conflict(member_id) do nothing;
  else
    update public.adult_payment_orders set status='rejected',decided_at=now() where id=o.id returning * into o;
  end if;
  insert into public.adult_audit(actor,action,order_id,note)
    values(p_actor,case when p_approve then 'approve' else 'reject' end,o.id,audit_note);
  return to_jsonb(o);
exception when unique_violation then
  get stacked diagnostics v_constraint_name=CONSTRAINT_NAME;
  if v_constraint_name='adult_payment_orders_bank_reference_key' then raise exception 'receipt_already_used';end if;
  raise exception 'first_purchase_offer_used';
end $$;

revoke all on function public.adult_create_order(uuid,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.adult_create_order(uuid,text,uuid,uuid,integer) to service_role;
revoke all on function public.adult_decide_order(uuid,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.adult_decide_order(uuid,boolean,text,text,text) to service_role;
commit;
