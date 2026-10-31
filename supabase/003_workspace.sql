-- Run after schema.sql and 002_backend.sql in the Adult project only.
begin;
alter table public.adult_audit add column if not exists member_id uuid references public.adult_members(id);
create table if not exists public.adult_reset_requests(
 member_id uuid primary key references public.adult_members(id) on delete cascade,
 requested_at timestamptz not null default now(),resolved_at timestamptz
);
create table if not exists public.adult_library(
 member_id uuid not null references public.adult_members(id) on delete cascade,
 story_id uuid not null references public.stories(id) on delete cascade,
 saved boolean not null default false,read_fraction double precision not null default 0 check(read_fraction between 0 and 1),
 audio_seconds double precision not null default 0 check(audio_seconds between 0 and 864000),
 audio_duration double precision not null default 0 check(audio_duration between 0 and 864000),
 revision bigint not null default 1,updated_at timestamptz not null default now(),primary key(member_id,story_id)
);
create table if not exists public.adult_editor_drafts(
 owner_id uuid not null references auth.users(id) on delete cascade,draft_key text not null,
 payload jsonb not null,revision bigint not null default 1,updated_at timestamptz not null default now(),primary key(owner_id,draft_key),
 check(octet_length(payload::text)<2000000),check(length(draft_key)<=80)
);
alter table public.adult_reset_requests enable row level security;
alter table public.adult_library enable row level security;
alter table public.adult_editor_drafts enable row level security;
revoke all on public.adult_reset_requests,public.adult_library,public.adult_editor_drafts from public,anon,authenticated;
grant all on public.adult_reset_requests,public.adult_library,public.adult_editor_drafts to service_role;
grant select,insert,update,delete on public.adult_editor_drafts to authenticated;
drop policy if exists own_admin_drafts on public.adult_editor_drafts;
create policy own_admin_drafts on public.adult_editor_drafts for all to authenticated
 using(owner_id=auth.uid() and public.is_admin())
 with check(owner_id=auth.uid() and public.is_admin());

create or replace function public.adult_new_session(p_member uuid,p_expected_hash text,p_token_hash text,p_expiry timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.adult_members where id=p_member and password_hash=p_expected_hash and status='active' for update;
 if not found then raise exception 'login_required';end if;
 insert into public.adult_sessions(token_hash,member_id,expires_at) values(p_token_hash,p_member,p_expiry);
end $$;
create or replace function public.adult_reset_password(p_member uuid,p_hash text,p_actor text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if length(trim(p_note))<5 or length(p_note)>500 or p_hash !~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$' then raise exception 'invalid_reset';end if;
 perform 1 from public.adult_members where id=p_member and status='active' for update;
 if not found then raise exception 'account_inactive';end if;
 update public.adult_members set password_hash=p_hash where id=p_member;
 delete from public.adult_sessions where member_id=p_member;
 update public.adult_reset_requests set resolved_at=now() where member_id=p_member;
 insert into public.adult_audit(actor,action,member_id,note)values(p_actor,'password_reset',p_member,p_note);
end $$;
create or replace function public.adult_request_reset(p_phone text)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.adult_reset_requests(member_id)select id from public.adult_members where phone=p_phone and status='active'
 on conflict(member_id)do update set requested_at=now(),resolved_at=null
 where adult_reset_requests.requested_at<now()-interval '15 minutes';
end $$;
create or replace function public.adult_library_patch(p_member uuid,p_story uuid,p_revision bigint,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.adult_library;
begin
 -- Serializes creation as well as updates for this member, including offline retries.
 perform 1 from public.adult_members where id=p_member and status='active' for update;
 if not found then raise exception 'login_required';end if;
 perform 1 from public.stories where id=p_story and status='published';if not found then raise exception 'story_unavailable';end if;
 select * into r from public.adult_library where member_id=p_member and story_id=p_story for update;
 if coalesce(r.revision,0)<>p_revision then return jsonb_build_object('conflict',true,'row',to_jsonb(r));end if;
 insert into public.adult_library(member_id,story_id)values(p_member,p_story)on conflict do nothing;
 update public.adult_library set
 saved=case when p_patch?'saved' then (p_patch->>'saved')::boolean else saved end,
 read_fraction=case when p_patch?'read_fraction' then (p_patch->>'read_fraction')::float8 else read_fraction end,
 audio_seconds=case when p_patch?'audio_seconds' then (p_patch->>'audio_seconds')::float8 else audio_seconds end,
 audio_duration=case when p_patch?'audio_duration' then (p_patch->>'audio_duration')::float8 else audio_duration end,
 revision=case when r.revision is null then 1 else revision+1 end,updated_at=now()
 where member_id=p_member and story_id=p_story returning * into r;
 return jsonb_build_object('conflict',false,'row',to_jsonb(r));
end $$;
create or replace function public.adult_dashboard_report()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('currency','MNT','as_of',now(),
 'revenue_total',(select coalesce(sum(amount),0) from public.adult_payment_orders where status='approved'),
 'revenue_month',(select coalesce(sum(amount),0) from public.adult_payment_orders where status='approved' and decided_at>=date_trunc('month',now() at time zone 'Asia/Ulaanbaatar') at time zone 'Asia/Ulaanbaatar'),
 'pending_amount',(select coalesce(sum(amount),0) from public.adult_payment_orders where status='pending'),
 'pending_count',(select count(*) from public.adult_payment_orders where status='pending'),
 'reported_count',(select count(*) from public.adult_payment_orders where status='pending' and payment_reported_at is not null),
 'reset_count',(select count(*) from public.adult_reset_requests where resolved_at is null),
 'active_members',(select count(distinct member_id) from public.adult_entitlements e join public.adult_members m on m.id=e.member_id where m.status='active' and revoked_at is null and (expires_at is null or expires_at>now())),
 'active_entitlements',(select count(*) from public.adult_entitlements e join public.adult_members m on m.id=e.member_id where m.status='active' and revoked_at is null and (expires_at is null or expires_at>now())));
$$;
revoke all on function public.adult_new_session(uuid,text,text,timestamptz),public.adult_reset_password(uuid,text,text,text),public.adult_request_reset(text),public.adult_library_patch(uuid,uuid,bigint,jsonb),public.adult_dashboard_report() from public,anon,authenticated;
grant execute on function public.adult_new_session(uuid,text,text,timestamptz),public.adult_reset_password(uuid,text,text,text),public.adult_request_reset(text),public.adult_library_patch(uuid,uuid,bigint,jsonb),public.adult_dashboard_report() to service_role;

create or replace function public.adult_change_password(p_member uuid,p_expected text,p_hash text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.adult_members where id=p_member and password_hash=p_expected and status='active' for update;
 if not found then raise exception 'login_required';end if;
 update public.adult_members set password_hash=p_hash where id=p_member;
 delete from public.adult_sessions where member_id=p_member;
 insert into public.adult_audit(actor,action,member_id,note)values(p_member::text,'password_changed',p_member,'Customer changed own password');
end $$;
revoke all on function public.adult_change_password(uuid,text,text) from public,anon,authenticated;
grant execute on function public.adult_change_password(uuid,text,text) to service_role;
-- Full audio uses a PRIVATE bucket; public previews/images still use Cloudinary.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('adult-audio','adult-audio',false,524288000,array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/flac','audio/x-m4a'])
 on conflict(id)do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- A CMS save changes the public metadata and paid body in one transaction.
create or replace function public.adult_save_story(p_story jsonb,p_body jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.stories;existing public.stories;result public.stories;
begin
 if not public.is_admin() then raise exception 'admin_required';end if;
 s:=jsonb_populate_record(null::public.stories,p_story);s.id:=coalesce(s.id,gen_random_uuid());
 select * into existing from public.stories where id=s.id for update;
 if found and p_expected_updated_at is not null and existing.updated_at<>p_expected_updated_at then raise exception 'story_changed_elsewhere';end if;
 insert into public.stories(id,slug,title,category,excerpt,preview_text,author,status,price,read_minutes,sort_order,tags,cover_id,overlay,audio_preview_url,publish_at)
 values(s.id,s.slug,s.title,coalesce(s.category,''),coalesce(s.excerpt,''),coalesce(s.preview_text,''),coalesce(s.author,'ADULT Stories'),coalesce(s.status,'draft'),coalesce(s.price,9900),coalesce(s.read_minutes,1),coalesce(s.sort_order,100),coalesce(s.tags,'{}'),s.cover_id,coalesce(s.overlay,'{}'),coalesce(s.audio_preview_url,''),s.publish_at)
 on conflict(id)do update set slug=excluded.slug,title=excluded.title,category=excluded.category,excerpt=excluded.excerpt,preview_text=excluded.preview_text,status=excluded.status,price=excluded.price,read_minutes=excluded.read_minutes,sort_order=excluded.sort_order,tags=excluded.tags,cover_id=excluded.cover_id,overlay=excluded.overlay,audio_preview_url=excluded.audio_preview_url,publish_at=excluded.publish_at
 returning * into result;
 if p_body is not null then
  insert into public.story_private(story_id,full_text,full_audio_url)
  values(s.id,coalesce(p_body->>'full_text',''),coalesce(p_body->>'full_audio_url',''))
  on conflict(story_id)do update set full_text=excluded.full_text,full_audio_url=excluded.full_audio_url;
 end if;
 return to_jsonb(result);
end $$;
revoke all on function public.adult_save_story(jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.adult_save_story(jsonb,jsonb,timestamptz) to authenticated;

commit;
