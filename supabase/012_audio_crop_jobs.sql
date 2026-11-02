-- Background jobs for securely rendering a selected IN/OUT segment as a public preview.
-- Apply after 008_audio_workflow.sql (or after 007_story_series.sql if 008 is not installed).
begin;

create table if not exists public.adult_audio_crop_jobs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  start_seconds numeric(10,3) not null check (start_seconds >= 0),
  end_seconds numeric(10,3) not null check (end_seconds > start_seconds and end_seconds - start_seconds between 5 and 180),
  duration_seconds numeric(10,2) not null default 0 check (duration_seconds >= 0),
  preview_url text not null default '',
  error_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adult_audio_crop_jobs_story_created_idx
  on public.adult_audio_crop_jobs(story_id, created_at desc);
alter table public.adult_audio_crop_jobs enable row level security;
revoke all on public.adult_audio_crop_jobs from public, anon, authenticated;
grant all on public.adult_audio_crop_jobs to service_role;

commit;
