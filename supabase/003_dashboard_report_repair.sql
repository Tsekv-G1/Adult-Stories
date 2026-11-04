-- Safe, rerunnable repair for the Adult Stories admin report RPC.
-- Run in the Adult Stories Supabase project after 002_backend.sql.
-- The broader 003_workspace.sql migration also defines this function.
create table if not exists public.adult_reset_requests(
  member_id uuid primary key references public.adult_members(id) on delete cascade,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.adult_reset_requests enable row level security;
revoke all on public.adult_reset_requests from public, anon, authenticated;
grant all on public.adult_reset_requests to service_role;

create or replace function public.adult_dashboard_report()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', 'MNT',
    'as_of', now(),
    'revenue_total', (
      select coalesce(sum(amount), 0)
      from public.adult_payment_orders
      where status = 'approved'
    ),
    'revenue_month', (
      select coalesce(sum(amount), 0)
      from public.adult_payment_orders
      where status = 'approved'
        and decided_at >= date_trunc('month', now() at time zone 'Asia/Ulaanbaatar') at time zone 'Asia/Ulaanbaatar'
    ),
    'pending_amount', (
      select coalesce(sum(amount), 0)
      from public.adult_payment_orders
      where status = 'pending'
    ),
    'pending_count', (
      select count(*)
      from public.adult_payment_orders
      where status = 'pending'
    ),
    'reported_count', (
      select count(*)
      from public.adult_payment_orders
      where status = 'pending' and payment_reported_at is not null
    ),
    'reset_count', (
      select count(*)
      from public.adult_reset_requests
      where resolved_at is null
    ),
    'active_members', (
      select count(distinct e.member_id)
      from public.adult_entitlements e
      join public.adult_members m on m.id = e.member_id
      where m.status = 'active'
        and e.revoked_at is null
        and (e.expires_at is null or e.expires_at > now())
    ),
    'active_entitlements', (
      select count(*)
      from public.adult_entitlements e
      join public.adult_members m on m.id = e.member_id
      where m.status = 'active'
        and e.revoked_at is null
        and (e.expires_at is null or e.expires_at > now())
    )
  );
$$;

revoke all on function public.adult_dashboard_report() from public, anon, authenticated;
grant execute on function public.adult_dashboard_report() to service_role;
