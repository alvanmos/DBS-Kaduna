begin;

alter table public.portal_messages
  drop constraint if exists portal_messages_channel_context_check;

alter table public.portal_messages
  add constraint portal_messages_channel_context_check check (
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
    or (
      channel = 'admin_student'
      and student_id is not null
      and instructor_id is null
    )
  );

create or replace function public.admin_send_student_message(
  input_student_ids uuid[],
  input_body text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  trimmed_body text := nullif(trim(input_body), '');
  requested_count integer;
  recipient_count integer;
  delivered_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if trimmed_body is null then
    raise exception 'Enter a message before sending';
  end if;

  select count(distinct student_id)
  into requested_count
  from unnest(coalesce(input_student_ids, '{}'::uuid[])) as selected(student_id);

  if requested_count = 0 then
    raise exception 'Select at least one student';
  end if;

  select count(*)
  into recipient_count
  from public.students student
  where student.id = any(input_student_ids)
    and student.status = 'active'
    and student.profile_id is not null;

  if recipient_count <> requested_count then
    raise exception 'One or more selected students cannot receive messages';
  end if;

  insert into public.portal_messages (
    channel,
    student_id,
    instructor_id,
    sender_profile_id,
    recipient_profile_id,
    body
  )
  select
    'admin_student',
    student.id,
    null,
    auth.uid(),
    student.profile_id,
    trimmed_body
  from public.students student
  where student.id = any(input_student_ids)
    and student.status = 'active'
    and student.profile_id is not null;

  get diagnostics delivered_count = row_count;
  return delivered_count;
end;
$$;

revoke all on function public.admin_send_student_message(uuid[], text) from public;
grant execute on function public.admin_send_student_message(uuid[], text) to authenticated;

commit;
