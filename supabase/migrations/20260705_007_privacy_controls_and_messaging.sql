begin;

do $$
begin
  create type public.portal_message_channel as enum (
    'student_instructor',
    'admin_instructor'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  channel public.portal_message_channel not null,
  student_id uuid references public.students (id) on delete cascade,
  instructor_id uuid references public.instructors (id) on delete cascade,
  sender_profile_id uuid not null
    references public.profiles (id) on delete cascade,
  recipient_profile_id uuid not null
    references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint portal_messages_channel_context_check check (
    (
      channel = 'student_instructor'
      and student_id is not null
      and instructor_id is not null
    )
    or (
      channel = 'admin_instructor'
      and student_id is null
      and instructor_id is not null
    )
  )
);

create index if not exists portal_messages_student_idx
  on public.portal_messages (student_id, created_at);

create index if not exists portal_messages_instructor_idx
  on public.portal_messages (instructor_id, channel, created_at);

create index if not exists portal_messages_recipient_idx
  on public.portal_messages (recipient_profile_id, read_at, created_at desc);

alter table public.portal_messages enable row level security;

grant select on public.portal_messages to authenticated;

create policy portal_messages_select
on public.portal_messages
for select
to authenticated
using (
  public.is_admin()
  or sender_profile_id = auth.uid()
  or recipient_profile_id = auth.uid()
);

create or replace function public.active_admin_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.id
  from public.profiles
  where profiles.role = 'admin'
    and profiles.status = 'active'
  order by profiles.created_at asc, profiles.id asc
  limit 1;
$$;

revoke all on function public.active_admin_profile_id() from public;
grant execute on function public.active_admin_profile_id() to authenticated;

create or replace function public.student_send_message(input_body text)
returns public.portal_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_record public.students;
  instructor_record public.instructors;
  trimmed_body text := nullif(trim(input_body), '');
  created_message public.portal_messages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if trimmed_body is null then
    raise exception 'Enter a message before sending';
  end if;

  select *
  into student_record
  from public.students
  where profile_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Student account not found';
  end if;

  if student_record.instructor_id is null then
    raise exception 'No instructor is assigned to this student yet';
  end if;

  select *
  into instructor_record
  from public.instructors
  where id = student_record.instructor_id
    and status = 'active';

  if not found then
    raise exception 'Assigned instructor is unavailable';
  end if;

  insert into public.portal_messages (
    channel,
    student_id,
    instructor_id,
    sender_profile_id,
    recipient_profile_id,
    body
  )
  values (
    'student_instructor',
    student_record.id,
    instructor_record.id,
    auth.uid(),
    instructor_record.profile_id,
    trimmed_body
  )
  returning * into created_message;

  perform public.touch_my_activity();
  return created_message;
end;
$$;

revoke all on function public.student_send_message(text) from public;
grant execute on function public.student_send_message(text) to authenticated;

create or replace function public.instructor_send_student_message(
  input_student_id uuid,
  input_body text
)
returns public.portal_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  instructor_record public.instructors;
  student_record public.students;
  trimmed_body text := nullif(trim(input_body), '');
  created_message public.portal_messages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if trimmed_body is null then
    raise exception 'Enter a message before sending';
  end if;

  select *
  into instructor_record
  from public.instructors
  where profile_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Instructor account not found';
  end if;

  select *
  into student_record
  from public.students
  where id = input_student_id
    and instructor_id = instructor_record.id
    and status = 'active';

  if not found then
    raise exception 'Student is not assigned to this instructor';
  end if;

  if student_record.profile_id is null then
    raise exception 'This student profile is unavailable';
  end if;

  insert into public.portal_messages (
    channel,
    student_id,
    instructor_id,
    sender_profile_id,
    recipient_profile_id,
    body
  )
  values (
    'student_instructor',
    student_record.id,
    instructor_record.id,
    auth.uid(),
    student_record.profile_id,
    trimmed_body
  )
  returning * into created_message;

  perform public.touch_my_activity();
  return created_message;
end;
$$;

revoke all
  on function public.instructor_send_student_message(uuid, text)
  from public;
grant execute
  on function public.instructor_send_student_message(uuid, text)
  to authenticated;

create or replace function public.instructor_send_admin_message(input_body text)
returns public.portal_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  instructor_record public.instructors;
  admin_profile_id uuid;
  trimmed_body text := nullif(trim(input_body), '');
  created_message public.portal_messages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if trimmed_body is null then
    raise exception 'Enter a message before sending';
  end if;

  select *
  into instructor_record
  from public.instructors
  where profile_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Instructor account not found';
  end if;

  admin_profile_id := public.active_admin_profile_id();
  if admin_profile_id is null then
    raise exception 'No active administrator account is available';
  end if;

  insert into public.portal_messages (
    channel,
    instructor_id,
    sender_profile_id,
    recipient_profile_id,
    body
  )
  values (
    'admin_instructor',
    instructor_record.id,
    auth.uid(),
    admin_profile_id,
    trimmed_body
  )
  returning * into created_message;

  perform public.touch_my_activity();
  return created_message;
end;
$$;

revoke all on function public.instructor_send_admin_message(text) from public;
grant execute on function public.instructor_send_admin_message(text) to authenticated;

create or replace function public.admin_send_instructor_message(
  input_instructor_id uuid,
  input_body text
)
returns public.portal_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  instructor_record public.instructors;
  trimmed_body text := nullif(trim(input_body), '');
  created_message public.portal_messages;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if trimmed_body is null then
    raise exception 'Enter a message before sending';
  end if;

  select *
  into instructor_record
  from public.instructors
  where id = input_instructor_id
    and status = 'active';

  if not found then
    raise exception 'Instructor account not found';
  end if;

  insert into public.portal_messages (
    channel,
    instructor_id,
    sender_profile_id,
    recipient_profile_id,
    body
  )
  values (
    'admin_instructor',
    instructor_record.id,
    auth.uid(),
    instructor_record.profile_id,
    trimmed_body
  )
  returning * into created_message;

  return created_message;
end;
$$;

revoke all
  on function public.admin_send_instructor_message(uuid, text)
  from public;
grant execute
  on function public.admin_send_instructor_message(uuid, text)
  to authenticated;

create or replace function public.student_update_my_data(input_payload jsonb)
returns public.students
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_record public.students;
  updated_student public.students;
  new_full_name text := nullif(trim(coalesce(input_payload ->> 'full_name', '')), '');
  new_email text := lower(nullif(trim(coalesce(input_payload ->> 'email', '')), ''));
  new_phone text := nullif(trim(coalesce(input_payload ->> 'phone', '')), '');
  new_address text := nullif(trim(coalesce(input_payload ->> 'address', '')), '');
  new_denomination text := nullif(trim(coalesce(input_payload ->> 'denomination', '')), '');
  new_username text := lower(coalesce(input_payload ->> 'username', ''));
  sanitized_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into student_record
  from public.students
  where profile_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Student account not found';
  end if;

  if new_full_name is null then
    raise exception 'Full name is required';
  end if;

  if new_email is null or position('@' in new_email) = 0 then
    raise exception 'A valid email address is required';
  end if;

  new_username := regexp_replace(new_username, '[^a-z0-9._-]+', '-', 'g');
  new_username := regexp_replace(new_username, '(^[._-]+|[._-]+$)', '', 'g');
  new_username := regexp_replace(new_username, '[-._]{2,}', '-', 'g');

  if new_username !~ '^[a-z0-9._-]{3,24}$' then
    raise exception 'Choose a username with 3 to 24 letters, numbers, dots, hyphens, or underscores.';
  end if;

  if exists (
    select 1
    from public.profiles
    where id <> auth.uid()
      and lower(email) = new_email
  ) then
    raise exception 'That email address is already in use';
  end if;

  if exists (
    select 1
    from public.profiles
    where id <> auth.uid()
      and lower(username) = new_username
  ) then
    raise exception 'That username is already in use';
  end if;

  sanitized_payload := coalesce(student_record.registration_data, '{}'::jsonb) ||
    jsonb_build_object(
      'full_name', new_full_name,
      'email', new_email,
      'username', new_username,
      'phone', new_phone,
      'address', new_address,
      'denomination', new_denomination,
      'is_adventist', coalesce((input_payload ->> 'is_adventist')::boolean, false)
    ) ||
    (
      coalesce(input_payload, '{}'::jsonb)
      - 'password'
      - 'website'
      - 'privacy_consent'
    );

  update public.profiles
  set
    full_name = new_full_name,
    email = new_email,
    phone = new_phone,
    username = new_username,
    last_activity_at = now()
  where id = auth.uid();

  update public.students
  set
    full_name = new_full_name,
    email = new_email,
    whatsapp = new_phone,
    address = new_address,
    location_name = coalesce(new_address, location_name),
    denomination = new_denomination,
    is_adventist = coalesce((input_payload ->> 'is_adventist')::boolean, false),
    registration_data = sanitized_payload
  where id = student_record.id
  returning * into updated_student;

  perform public.touch_my_activity();
  return updated_student;
end;
$$;

revoke all on function public.student_update_my_data(jsonb) from public;
grant execute on function public.student_update_my_data(jsonb) to authenticated;

create or replace function public.student_delete_my_account_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_record public.students;
  anonymized_username text := 'deleted-' || substr(replace(auth.uid()::text, '-', ''), 1, 12);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into student_record
  from public.students
  where profile_id = auth.uid();

  if not found then
    raise exception 'Student account not found';
  end if;

  delete from public.recruitment_enrolments
  where student_id = student_record.id;

  delete from public.certificates
  where student_id = student_record.id;

  delete from public.students
  where id = student_record.id;

  update public.profiles
  set
    full_name = 'Deleted student',
    email = null,
    phone = null,
    username = anonymized_username,
    status = 'inactive',
    last_activity_at = now()
  where id = auth.uid();

  return jsonb_build_object(
    'deleted', true,
    'profile_id', auth.uid()
  );
end;
$$;

revoke all on function public.student_delete_my_account_data() from public;
grant execute on function public.student_delete_my_account_data() to authenticated;

update public.registration_forms
set fields =
  (
    select
      coalesce(
        jsonb_agg(
          case
            when value ->> 'key' = 'privacy_consent' then
              value || jsonb_build_object(
                'label',
                'I consent to DBS Kaduna using my details for registration, course administration, and instructor support in line with the Privacy Notice.',
                'type',
                'checkbox',
                'required',
                true,
                'system',
                true
              )
            else value
          end
          order by ordinality
        ),
        '[]'::jsonb
      ) ||
      case
        when exists (
          select 1
          from jsonb_array_elements(public.registration_forms.fields) field
          where field ->> 'key' = 'privacy_consent'
        ) then '[]'::jsonb
        else jsonb_build_array(
          jsonb_build_object(
            'key',
            'privacy_consent',
            'label',
            'I consent to DBS Kaduna using my details for registration, course administration, and instructor support in line with the Privacy Notice.',
            'type',
            'checkbox',
            'required',
            true,
            'system',
            true
          )
        )
      end
    from jsonb_array_elements(public.registration_forms.fields) with ordinality as value(value, ordinality)
  )
where recruitment_kind in ('student', 'volunteer_instructor');

notify pgrst, 'reload schema';

commit;
