begin;

alter table public.profiles
  add column if not exists username text;

create or replace function public.make_unique_username(
  source_text text,
  input_id uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base_value text;
  candidate text;
  suffix integer := 0;
begin
  base_value := lower(coalesce(source_text, ''));
  base_value := regexp_replace(base_value, '@.*$', '', 'g');
  base_value := regexp_replace(base_value, '[^a-z0-9._-]+', '-', 'g');
  base_value := regexp_replace(base_value, '(^[._-]+|[._-]+$)', '', 'g');
  base_value := regexp_replace(base_value, '[-._]{2,}', '-', 'g');

  if base_value = '' then
    base_value := 'dbs-' || substr(replace(input_id::text, '-', ''), 1, 8);
  end if;

  candidate := left(base_value, 24);
  while exists (
    select 1
    from public.profiles
    where lower(profiles.username) = lower(candidate)
      and profiles.id <> input_id
  ) loop
    suffix := suffix + 1;
    candidate :=
      left(base_value, greatest(3, 24 - length(suffix::text) - 1)) ||
      '-' ||
      suffix::text;
  end loop;

  return candidate;
end;
$$;

do $$
declare
  profile_record record;
begin
  for profile_record in
    select
      id,
      coalesce(
        nullif(trim(username), ''),
        nullif(split_part(email, '@', 1), ''),
        nullif(trim(full_name), '')
      ) as username_source
    from public.profiles
    order by created_at, id
  loop
    update public.profiles
    set username = public.make_unique_username(profile_record.username_source, profile_record.id)
    where id = profile_record.id;
  end loop;
end;
$$;

drop index if exists public.profiles_username_unique;
create unique index profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.volunteer_registrations
  add column if not exists profile_id uuid
    references public.profiles (id) on delete set null;

update public.volunteer_registrations
set profile_id = profiles.id
from public.profiles
where volunteer_registrations.profile_id is null
  and lower(volunteer_registrations.email) = lower(profiles.email)
  and profiles.role = 'instructor';

alter table public.certificates
  add column if not exists storage_path text unique,
  add column if not exists original_file_name text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'certificate-pdfs',
  'certificate-pdfs',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists certificate_files_admin_insert on storage.objects;
create policy certificate_files_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'certificate-pdfs'
  and public.is_admin()
);

drop policy if exists certificate_files_admin_update on storage.objects;
create policy certificate_files_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'certificate-pdfs'
  and public.is_admin()
)
with check (
  bucket_id = 'certificate-pdfs'
  and public.is_admin()
);

drop policy if exists certificate_files_admin_delete on storage.objects;
create policy certificate_files_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'certificate-pdfs'
  and public.is_admin()
);

drop policy if exists certificate_files_authorized_select on storage.objects;
create policy certificate_files_authorized_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'certificate-pdfs'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.certificates
      where certificates.storage_path = storage.objects.name
        and certificates.student_id = public.current_student_id()
        and certificates.revoked_at is null
    )
  )
);

update public.registration_forms
set fields =
  jsonb_build_array(
    coalesce(
      (
        select value || '{"required":true,"system":true,"type":"text","label":"Full name"}'::jsonb
        from jsonb_array_elements(fields) value
        where value->>'key' = 'full_name'
        limit 1
      ),
      '{"key":"full_name","label":"Full name","type":"text","required":true,"system":true}'::jsonb
    ),
    coalesce(
      (
        select value || '{"required":true,"system":true,"type":"email","label":"Email address"}'::jsonb
        from jsonb_array_elements(fields) value
        where value->>'key' = 'email'
        limit 1
      ),
      '{"key":"email","label":"Email address","type":"email","required":true,"system":true}'::jsonb
    ),
    coalesce(
      (
        select value || '{"required":true,"system":true,"type":"text","label":"Username"}'::jsonb
        from jsonb_array_elements(fields) value
        where value->>'key' = 'username'
        limit 1
      ),
      '{"key":"username","label":"Username","type":"text","required":true,"system":true}'::jsonb
    ),
    coalesce(
      (
        select value || '{"required":true,"system":true,"type":"password","label":"Password"}'::jsonb
        from jsonb_array_elements(fields) value
        where value->>'key' = 'password'
        limit 1
      ),
      '{"key":"password","label":"Password","type":"password","required":true,"system":true}'::jsonb
    )
  ) || coalesce(
    (
      select jsonb_agg(value)
      from jsonb_array_elements(fields) value
      where value->>'key' not in ('full_name', 'email', 'username', 'password')
    ),
    '[]'::jsonb
  )
where recruitment_kind in ('student', 'volunteer_instructor');

create or replace function public.admin_clear_registration_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleared_students integer := 0;
  cleared_instructors integer := 0;
  cleared_enrolments integer := 0;
  cleared_volunteers integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  select count(*)
  into cleared_students
  from public.students
  where registration_data <> '{}'::jsonb;

  select count(*)
  into cleared_instructors
  from public.instructors
  where registration_data <> '{}'::jsonb;

  select count(*)
  into cleared_enrolments
  from public.recruitment_enrolments;

  select count(*)
  into cleared_volunteers
  from public.volunteer_registrations;

  update public.students
  set registration_data = '{}'::jsonb
  where registration_data <> '{}'::jsonb;

  update public.instructors
  set registration_data = '{}'::jsonb
  where registration_data <> '{}'::jsonb;

  delete from public.volunteer_registrations;
  delete from public.recruitment_enrolments;

  return jsonb_build_object(
    'students_cleared', cleared_students,
    'instructors_cleared', cleared_instructors,
    'enrolments_deleted', cleared_enrolments,
    'volunteer_registrations_deleted', cleared_volunteers
  );
end;
$$;

revoke all on function public.admin_clear_registration_data() from public;
grant execute on function public.admin_clear_registration_data() to authenticated;

commit;
