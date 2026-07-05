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

drop policy if exists portal_messages_select on public.portal_messages;
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

notify pgrst, 'reload schema';

commit;
