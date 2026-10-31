-- Additive migration for the Adult Stories project, AFTER schema.sql.
-- New member auth and payment tables are accessible only through server functions.
begin;
create table if not exists public.adult_members(
 id uuid primary key default gen_random_uuid(),phone text not null unique,
 name text not null default '',password_hash text not null,
 status text not null default 'active' check(status in ('active','suspended')),
 created_at timestamptz not null default now()
);
create table if not exists public.adult_sessions(
 token_hash text primary key,member_id uuid not null references public.adult_members(id) on delete cascade,
 expires_at timestamptz not null,created_at timestamptz not null default now()
);
create index if not exists adult_sessions_expiry on public.adult_sessions(expires_at);
create table if not exists public.adult_payment_orders(
 id uuid primary key default gen_random_uuid(),client_id uuid not null,
 member_id uuid not null references public.adult_members(id),kind text not null check(kind in ('story','membership')),
 story_id uuid references public.stories(id),amount integer not null check(amount>0),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 memo text not null,customer_reference text not null default '',bank_reference text unique,
 payment_reported_at timestamptz,decided_at timestamptz,created_at timestamptz not null default now(),
 unique(member_id,client_id),check((kind='story' and story_id is not null)or(kind='membership' and story_id is null))
);
create table if not exists public.adult_entitlements(
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.adult_members(id),
 story_id uuid references public.stories(id),order_id uuid not null unique references public.adult_payment_orders(id),
 expires_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.adult_audit(
 id bigint generated always as identity primary key,actor text not null,action text not null,
 order_id uuid references public.adult_payment_orders(id),note text not null,created_at timestamptz not null default now()
);
create table if not exists public.adult_rate_limits(key text primary key,hits integer not null,expires_at timestamptz not null);
alter table public.adult_members enable row level security;
alter table public.adult_sessions enable row level security;
alter table public.adult_payment_orders enable row level security;
alter table public.adult_entitlements enable row level security;
alter table public.adult_audit enable row level security;
alter table public.adult_rate_limits enable row level security;
revoke all on public.adult_members,public.adult_sessions,public.adult_payment_orders,public.adult_entitlements,public.adult_audit,public.adult_rate_limits from public,anon,authenticated;
grant select on public.stories,public.story_private,public.site_settings,public.admin_users to service_role;
grant all on public.adult_members,public.adult_sessions,public.adult_payment_orders,public.adult_entitlements,public.adult_audit,public.adult_rate_limits to service_role;
grant usage,select on sequence public.adult_audit_id_seq to service_role;

create or replace function public.adult_take_rate(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare count_hits integer;
begin
 insert into public.adult_rate_limits(key,hits,expires_at)values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key)do update set hits=case when adult_rate_limits.expires_at<=now()then 1 else adult_rate_limits.hits+1 end,
 expires_at=case when adult_rate_limits.expires_at<=now()then now()+make_interval(secs=>p_seconds)else adult_rate_limits.expires_at end
 returning hits into count_hits;
 return count_hits<=p_limit;
end $$;

create or replace function public.adult_create_order(p_member_id uuid,p_kind text,p_story_id uuid,p_client_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.adult_payment_orders;cost integer;published_at timestamptz;member_phone text;
begin
 select phone into member_phone from public.adult_members where id=p_member_id and status='active' for update;
 if not found then raise exception 'account_inactive';end if;
 select * into o from public.adult_payment_orders where member_id=p_member_id and client_id=p_client_id;
 if found then
  if o.kind<>p_kind or o.story_id is distinct from p_story_id then raise exception 'invalid_order';end if;
  return to_jsonb(o);
 end if;
 if p_kind='story' then
  select price,publish_at into cost,published_at from public.stories where id=p_story_id and status='published';
  if not found or published_at>now() then raise exception 'story_unavailable';end if;
 elsif p_kind='membership' and p_story_id is null then
  select coalesce((content->>'membership_price')::integer,29900) into cost from public.site_settings where id='main';
 else raise exception 'invalid_order';end if;
 if cost is null or cost<=0 then raise exception 'invalid_order';end if;
 -- Reuse a pending order for the same product rather than multiply bank transfers.
 select * into o from public.adult_payment_orders where member_id=p_member_id and kind=p_kind
 and story_id is not distinct from p_story_id and status='pending' order by created_at desc limit 1;
 if found then return to_jsonb(o);end if;
 insert into public.adult_payment_orders(member_id,client_id,kind,story_id,amount,memo)
 values(p_member_id,p_client_id,p_kind,p_story_id,cost,'AS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))||' '||member_phone)
 returning * into o;return to_jsonb(o);
end $$;

create or replace function public.adult_decide_order(p_order_id uuid,p_approve boolean,p_receipt text,p_note text,p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.adult_payment_orders;expiry timestamptz;receipt text;
begin
 if length(trim(p_note))<5 or length(p_note)>500 then raise exception 'verification_note_required';end if;
 receipt=upper(regexp_replace(coalesce(p_receipt,''),'\s','','g'));
 if p_approve and length(receipt)<4 then raise exception 'receipt_required';end if;
 select * into o from public.adult_payment_orders where id=p_order_id for update;
 if not found then raise exception 'invalid_order';end if;
 if o.status='approved' and p_approve and o.bank_reference=receipt then return to_jsonb(o);end if;
 if o.status<>'pending' then raise exception 'order_not_pending';end if;
 if p_approve then
  if exists(select 1 from public.adult_payment_orders where bank_reference=receipt and id<>o.id)then raise exception 'receipt_already_used';end if;
  if o.kind='membership' then
   -- Serialize extensions for one member, even across different orders.
   perform 1 from public.adult_members where id=o.member_id for update;
   select greatest(now(),coalesce(max(expires_at),now()))+interval '30 days' into expiry
    from public.adult_entitlements where member_id=o.member_id and story_id is null and revoked_at is null;
  else expiry=null;end if;
  update public.adult_payment_orders set status='approved',bank_reference=receipt,decided_at=now()where id=o.id returning * into o;
  insert into public.adult_entitlements(member_id,story_id,order_id,expires_at)values(o.member_id,o.story_id,o.id,expiry);
 else
  update public.adult_payment_orders set status='rejected',decided_at=now()where id=o.id returning * into o;
 end if;
 insert into public.adult_audit(actor,action,order_id,note)values(p_actor,case when p_approve then 'approve' else 'reject' end,o.id,p_note);
 return to_jsonb(o);
exception when unique_violation then raise exception 'receipt_already_used';
end $$;
create or replace function public.adult_revoke_entitlement(p_order_id uuid,p_note text,p_actor text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if length(trim(p_note))<5 or length(p_note)>500 then raise exception 'verification_note_required';end if;
 update public.adult_entitlements set revoked_at=now()where order_id=p_order_id and revoked_at is null;
 insert into public.adult_audit(actor,action,order_id,note)values(p_actor,'revoke',p_order_id,p_note);
end $$;
revoke all on function public.adult_take_rate(text,integer,integer),public.adult_create_order(uuid,text,uuid,uuid),public.adult_decide_order(uuid,boolean,text,text,text),public.adult_revoke_entitlement(uuid,text,text)from public,anon,authenticated;
grant execute on function public.adult_take_rate(text,integer,integer),public.adult_create_order(uuid,text,uuid,uuid),public.adult_decide_order(uuid,boolean,text,text,text),public.adult_revoke_entitlement(uuid,text,text)to service_role;
commit;
