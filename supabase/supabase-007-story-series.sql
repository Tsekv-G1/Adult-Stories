-- Story series: apply after 006_listening_experience.sql.
begin;
alter table public.stories add column if not exists series_title text not null default '';
alter table public.stories add column if not exists series_order integer;
alter table public.stories drop constraint if exists stories_series_order_check;
alter table public.stories add constraint stories_series_order_check check ((series_title='' and series_order is null) or (length(trim(series_title))>0 and series_order>=1));
create index if not exists stories_series_order_idx on public.stories(lower(series_title),series_order) where series_title<>'';
create unique index if not exists stories_series_order_unique_idx on public.stories(lower(series_title),series_order) where series_title<>'';
create or replace function public.adult_save_story(p_story jsonb,p_body jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.stories;existing public.stories;result public.stories;
begin
 if not public.is_admin() then raise exception 'admin_required';end if;
 s:=jsonb_populate_record(null::public.stories,p_story);s.id:=coalesce(s.id,gen_random_uuid());
 if (coalesce(s.series_title,'')='' and s.series_order is not null) or (coalesce(s.series_title,'')<>'' and coalesce(s.series_order,0)<1) then raise exception 'invalid_series_order';end if;
 select * into existing from public.stories where id=s.id for update;
 if found and p_expected_updated_at is not null and existing.updated_at<>p_expected_updated_at then raise exception 'story_changed_elsewhere';end if;
 insert into public.stories(id,slug,title,series_title,series_order,category,excerpt,preview_text,author,status,price,read_minutes,sort_order,tags,cover_id,overlay,audio_preview_url,publish_at)
 values(s.id,s.slug,s.title,coalesce(s.series_title,''),s.series_order,coalesce(s.category,''),coalesce(s.excerpt,''),coalesce(s.preview_text,''),coalesce(s.author,'ADULT Stories'),coalesce(s.status,'draft'),coalesce(s.price,9900),coalesce(s.read_minutes,1),coalesce(s.sort_order,100),coalesce(s.tags,'{}'),s.cover_id,coalesce(s.overlay,'{}'),coalesce(s.audio_preview_url,''),s.publish_at)
 on conflict(id)do update set slug=excluded.slug,title=excluded.title,series_title=excluded.series_title,series_order=excluded.series_order,category=excluded.category,excerpt=excluded.excerpt,preview_text=excluded.preview_text,status=excluded.status,price=excluded.price,read_minutes=excluded.read_minutes,sort_order=excluded.sort_order,tags=excluded.tags,cover_id=excluded.cover_id,overlay=excluded.overlay,audio_preview_url=excluded.audio_preview_url,publish_at=excluded.publish_at
 returning * into result;
 if p_body is not null then
  insert into public.story_private(story_id,full_text,full_audio_url) values(s.id,coalesce(p_body->>'full_text',''),coalesce(p_body->>'full_audio_url',''))
  on conflict(story_id)do update set full_text=excluded.full_text,full_audio_url=excluded.full_audio_url;
 end if;
 return to_jsonb(result);
end $$;
revoke all on function public.adult_save_story(jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.adult_save_story(jsonb,jsonb,timestamptz) to authenticated;

commit;
