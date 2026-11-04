-- Persist audio type and exact resume position for member devices.
-- Apply after 005_membership_passes.sql.
begin;

alter table public.adult_library add column if not exists audio_kind text;
update public.adult_library set audio_kind='full'
where audio_seconds>0 and audio_kind is null;
alter table public.adult_library drop constraint if exists adult_library_audio_kind_check;
alter table public.adult_library add constraint adult_library_audio_kind_check
  check (audio_kind is null or audio_kind in ('preview','full'));

create or replace function public.adult_library_patch(p_member uuid,p_story uuid,p_revision bigint,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.adult_library;
begin
 if p_patch ? 'audio_kind' and p_patch->>'audio_kind' not in ('preview','full') then
   raise exception 'invalid_progress';
 end if;
 perform 1 from public.adult_members where id=p_member and status='active' for update;
 if not found then raise exception 'login_required'; end if;
 perform 1 from public.stories where id=p_story and status='published';
 if not found then raise exception 'story_unavailable'; end if;
 select * into r from public.adult_library where member_id=p_member and story_id=p_story for update;
 if coalesce(r.revision,0)<>p_revision then
   return jsonb_build_object('conflict',true,'row',to_jsonb(r));
 end if;
 insert into public.adult_library(member_id,story_id) values(p_member,p_story) on conflict do nothing;
 update public.adult_library set
   saved=case when p_patch?'saved' then (p_patch->>'saved')::boolean else saved end,
   read_fraction=case when p_patch?'read_fraction' then (p_patch->>'read_fraction')::float8 else read_fraction end,
   audio_seconds=case when p_patch?'audio_seconds' then (p_patch->>'audio_seconds')::float8 else audio_seconds end,
   audio_duration=case when p_patch?'audio_duration' then (p_patch->>'audio_duration')::float8 else audio_duration end,
   audio_kind=case when p_patch?'audio_kind' then p_patch->>'audio_kind' else audio_kind end,
   revision=case when r.revision is null then 1 else revision+1 end,updated_at=now()
 where member_id=p_member and story_id=p_story returning * into r;
 return jsonb_build_object('conflict',false,'row',to_jsonb(r));
end $$;

revoke all on function public.adult_library_patch(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.adult_library_patch(uuid,uuid,bigint,jsonb) to service_role;
commit;
