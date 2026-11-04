-- Privacy-conscious, deduplicated story reads/listens for popularity sorting.
-- Apply in Supabase SQL Editor after 002_backend.sql.
begin;

create table if not exists public.adult_story_activity (
  story_id uuid not null references public.stories(id) on delete cascade,
  activity_day date not null,
  event_type text not null check (event_type in ('read','listen')),
  viewer_hash text not null check (viewer_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (story_id, activity_day, event_type, viewer_hash)
);
create index if not exists adult_story_activity_day_story
  on public.adult_story_activity(activity_day desc,story_id,event_type);

alter table public.adult_story_activity enable row level security;
revoke all on public.adult_story_activity from public,anon,authenticated;
grant all on public.adult_story_activity to service_role;

create or replace function public.adult_record_story_activity(
  p_story_id uuid,p_event_type text,p_viewer_hash text
) returns boolean language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
  if p_event_type not in ('read','listen') or p_viewer_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_activity';
  end if;
  if not exists(select 1 from public.stories s where s.id=p_story_id and s.status='published' and (s.publish_at is null or s.publish_at<=now())) then
    raise exception 'story_unavailable';
  end if;
  insert into public.adult_story_activity(story_id,activity_day,event_type,viewer_hash)
  values(p_story_id,(now() at time zone 'utc')::date,p_event_type,p_viewer_hash)
  on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted=1;
end $$;

create or replace function public.adult_story_metrics(p_story_ids uuid[],p_since date)
returns table(story_id uuid,reads_30d bigint,listens_30d bigint)
language sql stable security definer set search_path='' as $$
  select a.story_id,
    count(*) filter(where a.event_type='read') as reads_30d,
    count(*) filter(where a.event_type='listen') as listens_30d
  from public.adult_story_activity a
  where a.story_id=any(coalesce(p_story_ids,'{}'::uuid[]))
    and a.activity_day between greatest(coalesce(p_since,(now() at time zone 'utc')::date-29),(now() at time zone 'utc')::date-29)
      and (now() at time zone 'utc')::date
  group by a.story_id;
$$;

revoke all on function public.adult_record_story_activity(uuid,text,text),public.adult_story_metrics(uuid[],date) from public,anon,authenticated;
grant execute on function public.adult_record_story_activity(uuid,text,text),public.adult_story_metrics(uuid[],date) to service_role;
commit;
