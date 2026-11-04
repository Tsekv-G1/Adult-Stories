-- ADULT Stories V5 — Supabase initial schema.
-- Run in a NEW Supabase project's SQL Editor. Does NOT install payment billing.
-- Full paid text is in story_private, not in public stories.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Security-definer runs as schema owner so checking admin_users does not recurse.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https://'),
  public_id text not null default '',
  asset_id text not null default '',
  filename text not null default '',
  alt_text text not null default '',
  width integer not null default 0 check(width >= 0),
  height integer not null default 0 check(height >= 0),
  bytes bigint not null default 0 check(bytes >= 0),
  format text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(length(slug) between 1 and 120),
  title text not null check(length(title)>0),
  series_title text not null default '',
  series_order integer,
  category text not null default 'Нууцлаг',
  excerpt text not null default '',
  preview_text text not null default '',
  author text not null default 'ADULT Stories',
  status text not null default 'draft' check(status in ('draft','published','archived')),
  price integer not null default 9900 check(price >= 0),
  read_minutes integer not null default 10 check(read_minutes >= 1),
  sort_order integer not null default 100,
  tags text[] not null default '{}'::text[],
  cover_id uuid references public.media_assets(id) on delete set null,
  overlay jsonb not null default '{}'::jsonb,
  audio_preview_url text not null default '',
  publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stories_series_order_check check ((series_title='' and series_order is null) or (length(trim(series_title))>0 and series_order>=1))
);
create index if not exists stories_series_order_idx on public.stories(lower(series_title),series_order) where series_title<>'';
create unique index if not exists stories_series_order_unique_idx on public.stories(lower(series_title),series_order) where series_title<>'';

-- Crucial: do NOT put the paid body in the anonymous-readable stories table.
create table if not exists public.story_private (
  story_id uuid primary key references public.stories(id) on delete cascade,
  full_text text not null default '',
  full_audio_url text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at=now();return new;
end;
$$;
drop trigger if exists stories_touch on public.stories;
create trigger stories_touch before update on public.stories for each row execute function public.touch_updated_at();
drop trigger if exists site_touch on public.site_settings;
create trigger site_touch before update on public.site_settings for each row execute function public.touch_updated_at();
drop trigger if exists story_private_touch on public.story_private;
create trigger story_private_touch before update on public.story_private for each row execute function public.touch_updated_at();

alter table public.admin_users enable row level security;
alter table public.media_assets enable row level security;
alter table public.site_settings enable row level security;
alter table public.stories enable row level security;
alter table public.story_private enable row level security;

-- Explicit grants complement RLS. Supabase service role remains trusted server-side.
revoke all on public.admin_users, public.media_assets, public.site_settings, public.stories, public.story_private from anon, authenticated;
grant select on public.media_assets, public.site_settings, public.stories to anon;
grant select, insert, update, delete on public.media_assets, public.site_settings, public.stories, public.story_private to authenticated;

create policy "media public read" on public.media_assets for select to anon, authenticated using (true);
create policy "media admin insert" on public.media_assets for insert to authenticated with check ((select public.is_admin()));
create policy "media admin update" on public.media_assets for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "media admin delete" on public.media_assets for delete to authenticated using ((select public.is_admin()));

create policy "settings public read" on public.site_settings for select to anon, authenticated using (true);
create policy "settings admin insert" on public.site_settings for insert to authenticated with check ((select public.is_admin()));
create policy "settings admin update" on public.site_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "stories public read published" on public.stories for select to anon, authenticated
 using ((status='published' and (publish_at is null or publish_at<=now())) or (select public.is_admin()));
create policy "stories admin insert" on public.stories for insert to authenticated with check ((select public.is_admin()));
create policy "stories admin update" on public.stories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "stories admin delete" on public.stories for delete to authenticated using ((select public.is_admin()));

create policy "private admin select only" on public.story_private for select to authenticated using ((select public.is_admin()));
create policy "private admin insert" on public.story_private for insert to authenticated with check ((select public.is_admin()));
create policy "private admin update" on public.story_private for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "private admin delete" on public.story_private for delete to authenticated using ((select public.is_admin()));

insert into public.site_settings (id,content) values (
 'main',
 jsonb_build_object(
   'brand','ADULT STORIES',
   'hero_heading','ШӨНИЙН',
   'hero_accent','ХҮСЭЛ ЭНДЭЭС.',
   'hero_kicker','ӨГҮҮЛЛЭГИЙН ШИНЭ МЭДРЭМЖ',
   'hero_description','Нэг л мөр таны дараагийн руу татна. Сэтгэл хөдөлгөх түүхийн эхлэлийг үнэгүй уншиж, богино preview-г сонсоод, үргэлжлэлийг өөрөө нээгээрэй.',
   'hero_overlay',jsonb_build_object('red',42,'dark',55,'x',50,'y',50,'direction',105,'tint','#db123a','fit','cover'),
   'categories',jsonb_build_array('Нууцлаг','Романтик','Триллер'),
   'membership_price',29900,
   'membership_first_price',24900,
   'membership_list_price',34900,
   'seo_title','ADULT Stories — Өгүүллэгийн сан',
   'seo_description','Насанд хүрэгчдэд зориулсан өгүүллэг, аудио preview.'
 )
) on conflict (id) do nothing;

-- Realtime: harmless if already attached; realtime is an optimization, fallback polling works.
do $$ begin
  alter publication supabase_realtime add table public.stories;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.site_settings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.media_assets;
exception when duplicate_object then null; end $$;

-- IMPORTANT: After inviting your first admin in Authentication > Users, run:
-- insert into public.admin_users(user_id) values ('PASTE-ADMIN-USER-UUID-HERE');
-- Never add untrusted users to admin_users.
