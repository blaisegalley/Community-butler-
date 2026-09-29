-- Community Butler — butler profiles, and the review gate in front of them.
--
-- Run this in the Supabase SQL editor after schema.sql. Safe to re-run.
--
-- The thing to hold onto while reading this: every butler is a minor, and
-- this file is what decides which facts about a named high-school student
-- appear on a public website. So the default is that nothing is public.
-- A profile reaches the roster only once a manager has looked at the
-- photo, the answers and the wording and pressed Approve — and even then
-- the public sees a display name, a bio and a photo, never a full name,
-- an email, a phone number, or the area they work in.

-- ------------------------------------------------------------ columns

alter table public.butlers
  -- The raw questionnaire. Kept as written so a manager can check the
  -- generated bio against what the butler actually said.
  add column if not exists intake jsonb not null default '{}'::jsonb,
  -- What the roster shows. Defaults to first name + last initial rather
  -- than the full legal name the account was created with.
  add column if not exists display_name text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists photo_path text not null default '',
  add column if not exists profile_status text not null default 'Draft',
  -- Why a manager sent it back. Shown to the butler so a rejection is
  -- something they can act on rather than a dead end.
  add column if not exists profile_note text not null default '',
  add column if not exists reviewed_at timestamptz,
  -- Under-18s need a parent's say-so before their face and first name go
  -- on the internet. Recorded here, checked before publishing.
  add column if not exists guardian_consent boolean not null default false,
  add column if not exists guardian_name text not null default '',
  add column if not exists guardian_contact text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'butlers_profile_status_check'
  ) then
    alter table public.butlers add constraint butlers_profile_status_check
      check (profile_status in ('Draft', 'Pending', 'Approved', 'Rejected'));
  end if;
end $$;

create index if not exists butlers_review_queue_idx
  on public.butlers (profile_status, signed_up_at desc);

-- A profile cannot be Approved without consent on file. Enforced here
-- rather than in the dashboard, because a check that lives only in the
-- UI is one refactor away from not existing.
create or replace function public.butlers_guard_publication()
returns trigger language plpgsql as $$
begin
  if new.profile_status = 'Approved' then
    if not new.guardian_consent then
      raise exception 'Cannot publish a profile without guardian consent on file';
    end if;
    if coalesce(nullif(trim(new.display_name), ''), '') = '' then
      raise exception 'Cannot publish a profile without a display name';
    end if;
  end if;
  if new.profile_status is distinct from old.profile_status then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists butlers_guard_publication on public.butlers;
create trigger butlers_guard_publication before update on public.butlers
  for each row execute function public.butlers_guard_publication();

-- ------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'butler-photos', 'butler-photos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A butler writes only inside a folder named after their own user id, so
-- one butler cannot overwrite another's photo.
drop policy if exists "butler uploads own photo" on storage.objects;
create policy "butler uploads own photo" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'butler-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "butler replaces own photo" on storage.objects;
create policy "butler replaces own photo" on storage.objects for update to authenticated
  using (bucket_id = 'butler-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "butler removes own photo" on storage.objects;
create policy "butler removes own photo" on storage.objects for delete to authenticated
  using (bucket_id = 'butler-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- rpcs

-- The public roster. This is the ONLY route by which anything about a
-- butler reaches a signed-out visitor, and it is why `butlers` itself
-- still grants anon no read at all.
--
-- Note what is not selected: name, contact, service_area, intake,
-- guardian details. A roster that leaked a service area would tell a
-- stranger which neighbourhood a named, photographed 15-year-old works in.
create or replace function public.public_butlers()
returns table (
  id uuid,
  display_name text,
  bio text,
  photo_path text,
  job_type_prefs text[],
  signed_up_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, b.display_name, b.bio, b.photo_path, b.job_type_prefs, b.signed_up_at
  from public.butlers b
  where b.profile_status = 'Approved'
    and b.guardian_consent
  order by b.signed_up_at asc;
$$;

revoke all on function public.public_butlers() from public;
grant execute on function public.public_butlers() to anon, authenticated;

-- A butler submitting their own profile for review. Security definer so
-- it can move the row to 'Pending' without granting butlers a general
-- update on their own status — otherwise a butler could set 'Approved'.
create or replace function public.submit_butler_profile(
  p_intake jsonb,
  p_photo_path text,
  p_display_name text,
  p_guardian_consent boolean,
  p_guardian_name text,
  p_guardian_contact text
) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := public.current_butler_id();
  if me is null then raise exception 'not a butler'; end if;

  update public.butlers
     set intake = coalesce(p_intake, '{}'::jsonb),
         photo_path = coalesce(p_photo_path, ''),
         display_name = coalesce(p_display_name, ''),
         guardian_consent = coalesce(p_guardian_consent, false),
         guardian_name = coalesce(p_guardian_name, ''),
         guardian_contact = coalesce(p_guardian_contact, ''),
         -- Always back to Pending. Editing an approved profile pulls it
         -- off the public page until a manager has seen the new version,
         -- which is the whole point of the gate.
         profile_status = 'Pending',
         profile_note = ''
   where id = me;

  perform public.log_activity(
    (select name from public.butlers where id = me) || ' submitted a profile for review'
  );
end;
$$;

revoke all on function public.submit_butler_profile(jsonb,text,text,boolean,text,text) from public;
grant execute on function public.submit_butler_profile(jsonb,text,text,boolean,text,text) to authenticated;

-- Managers reviewing. Admin-only, and the only way a row reaches
-- 'Approved'. The bio is passed back in so a manager can fix the
-- generated wording as part of approving rather than in a second step.
create or replace function public.review_butler_profile(
  p_butler_id uuid,
  p_status text,
  p_display_name text,
  p_bio text,
  p_note text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_status not in ('Approved', 'Rejected', 'Pending') then
    raise exception 'unknown status %', p_status;
  end if;

  update public.butlers
     set profile_status = p_status,
         display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
         bio = coalesce(p_bio, bio),
         profile_note = coalesce(p_note, '')
   where id = p_butler_id;

  perform public.log_activity(
    (select name from public.butlers where id = p_butler_id) || ' profile ' || lower(p_status)
  );
end;
$$;

revoke all on function public.review_butler_profile(uuid,text,text,text,text) from public;
grant execute on function public.review_butler_profile(uuid,text,text,text,text) to authenticated;
