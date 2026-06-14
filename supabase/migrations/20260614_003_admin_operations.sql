begin;

create function public.admin_approve_instructor_application(
  application_id uuid,
  student_limit integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_record public.instructor_applications;
  instructor_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if student_limit < 1 or student_limit > 100 then
    raise exception 'Student limit must be between 1 and 100';
  end if;

  select *
  into application_record
  from public.instructor_applications
  where id = application_id
  for update;

  if not found then
    raise exception 'Instructor application not found';
  end if;

  if application_record.status <> 'pending' then
    raise exception 'Instructor application has already been reviewed';
  end if;

  update public.profiles
  set role = 'instructor', status = 'active'
  where id = application_record.profile_id;

  insert into public.instructors (
    profile_id,
    whatsapp,
    max_student_load,
    status,
    approved_at
  )
  values (
    application_record.profile_id,
    application_record.whatsapp,
    student_limit,
    'active',
    now()
  )
  on conflict (profile_id) do update
  set
    whatsapp = excluded.whatsapp,
    max_student_load = excluded.max_student_load,
    status = 'active',
    approved_at = now()
  returning id into instructor_id;

  update public.instructor_applications
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = application_id;

  return instructor_id;
end;
$$;

revoke all
  on function public.admin_approve_instructor_application(uuid, integer)
  from public;
grant execute
  on function public.admin_approve_instructor_application(uuid, integer)
  to authenticated;

create function public.admin_move_question(
  question_id uuid,
  direction integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_question public.questions;
  target_question public.questions;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if direction not in (-1, 1) then
    raise exception 'Direction must be -1 or 1';
  end if;

  select *
  into current_question
  from public.questions
  where id = question_id
  for update;

  if not found then
    raise exception 'Question not found';
  end if;

  select *
  into target_question
  from public.questions
  where lesson_number = current_question.lesson_number
    and sort_order = current_question.sort_order + direction
  for update;

  if not found then
    return;
  end if;

  set constraints questions_lesson_order_unique deferred;

  update public.questions
  set sort_order = target_question.sort_order
  where id = current_question.id;

  update public.questions
  set sort_order = current_question.sort_order
  where id = target_question.id;
end;
$$;

revoke all on function public.admin_move_question(uuid, integer) from public;
grant execute
  on function public.admin_move_question(uuid, integer)
  to authenticated;

create function public.admin_issue_certificate(input_student_id uuid)
returns public.certificates
language plpgsql
security definer
set search_path = ''
as $$
declare
  certificate_record public.certificates;
  generated_code text;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if not exists (
    select 1
    from public.students
    where id = input_student_id
      and milestone in ('awaiting_graduation', 'graduated')
  ) then
    raise exception 'Student is not eligible for a certificate';
  end if;

  generated_code :=
    'DBS-KD-CERT-' ||
    to_char(now(), 'YY') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.certificates (
    student_id,
    verification_code,
    issued_by
  )
  values (
    input_student_id,
    generated_code,
    auth.uid()
  )
  returning * into certificate_record;

  return certificate_record;
end;
$$;

revoke all on function public.admin_issue_certificate(uuid) from public;
grant execute
  on function public.admin_issue_certificate(uuid)
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'news-media',
  'news-media',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy news_media_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'news-media'
  and public.is_admin()
);

create policy news_media_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'news-media'
  and public.is_admin()
)
with check (
  bucket_id = 'news-media'
  and public.is_admin()
);

create policy news_media_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'news-media'
  and public.is_admin()
);

commit;
