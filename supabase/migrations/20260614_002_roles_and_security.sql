begin;

grant usage on schema public to anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create function public.current_instructor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select instructors.id
  from public.instructors
  join public.profiles
    on profiles.id = instructors.profile_id
  where instructors.profile_id = auth.uid()
    and instructors.status = 'active'
    and profiles.status = 'active'
  limit 1;
$$;

create function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select students.id
  from public.students
  join public.profiles
    on profiles.id = students.profile_id
  where students.profile_id = auth.uid()
    and students.status = 'active'
    and profiles.status = 'active'
  limit 1;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.current_instructor_id() from public;
revoke all on function public.current_student_id() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_instructor_id() to authenticated;
grant execute on function public.current_student_id() to authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;
grant usage, select
  on all sequences in schema public
  to authenticated;

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create function public.update_my_profile(
  new_full_name text,
  new_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(new_full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  update public.profiles
  set
    full_name = trim(new_full_name),
    phone = nullif(trim(new_phone), '')
  where id = auth.uid()
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public;
grant execute
  on function public.update_my_profile(text, text)
  to authenticated;

create policy instructor_applications_owner_select
on public.instructor_applications
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin()
);

create policy instructor_applications_owner_insert
on public.instructor_applications
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

create policy instructor_applications_admin_update
on public.instructor_applications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy instructor_applications_admin_delete
on public.instructor_applications
for delete
to authenticated
using (public.is_admin());

create policy instructors_select
on public.instructors
for select
to authenticated
using (
  public.is_admin()
  or profile_id = auth.uid()
  or id = (
    select students.instructor_id
    from public.students
    where students.profile_id = auth.uid()
    limit 1
  )
);

create policy instructors_admin_insert
on public.instructors
for insert
to authenticated
with check (public.is_admin());

create policy instructors_admin_update
on public.instructors
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy instructors_admin_delete
on public.instructors
for delete
to authenticated
using (public.is_admin());

create policy students_select
on public.students
for select
to authenticated
using (
  public.is_admin()
  or profile_id = auth.uid()
  or instructor_id = public.current_instructor_id()
);

create policy students_admin_insert
on public.students
for insert
to authenticated
with check (public.is_admin());

create policy students_admin_update
on public.students
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy students_admin_delete
on public.students
for delete
to authenticated
using (public.is_admin());

create policy lessons_authenticated_select
on public.lessons
for select
to authenticated
using (
  public.is_admin()
  or is_published
);

create policy lessons_admin_insert
on public.lessons
for insert
to authenticated
with check (public.is_admin());

create policy lessons_admin_update
on public.lessons
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy lessons_admin_delete
on public.lessons
for delete
to authenticated
using (public.is_admin());

create policy questions_authenticated_select
on public.questions
for select
to authenticated
using (
  public.is_admin()
  or is_published
);

create policy questions_admin_insert
on public.questions
for insert
to authenticated
with check (public.is_admin());

create policy questions_admin_update
on public.questions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy questions_admin_delete
on public.questions
for delete
to authenticated
using (public.is_admin());

create policy answer_keys_select
on public.question_answer_keys
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.questions
    where questions.id = question_answer_keys.question_id
      and questions.marker_instructor_id = public.current_instructor_id()
  )
);

create policy answer_keys_admin_insert
on public.question_answer_keys
for insert
to authenticated
with check (public.is_admin());

create policy answer_keys_admin_update
on public.question_answer_keys
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy answer_keys_admin_delete
on public.question_answer_keys
for delete
to authenticated
using (public.is_admin());

create policy progress_select
on public.student_lesson_progress
for select
to authenticated
using (
  public.is_admin()
  or student_id = public.current_student_id()
  or exists (
    select 1
    from public.students
    where students.id = student_lesson_progress.student_id
      and students.instructor_id = public.current_instructor_id()
  )
);

create policy progress_admin_insert
on public.student_lesson_progress
for insert
to authenticated
with check (public.is_admin());

create policy progress_admin_update
on public.student_lesson_progress
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy progress_admin_delete
on public.student_lesson_progress
for delete
to authenticated
using (public.is_admin());

create policy submissions_select
on public.submissions
for select
to authenticated
using (
  public.is_admin()
  or student_id = public.current_student_id()
  or marker_instructor_id = public.current_instructor_id()
  or exists (
    select 1
    from public.students
    where students.id = submissions.student_id
      and students.instructor_id = public.current_instructor_id()
  )
);

create policy submissions_student_insert
on public.submissions
for insert
to authenticated
with check (
  student_id = public.current_student_id()
  and status in ('draft', 'submitted')
  and score is null
  and feedback is null
  and marked_at is null
);

create policy submissions_student_update
on public.submissions
for update
to authenticated
using (
  student_id = public.current_student_id()
  and status in ('draft', 'returned')
)
with check (
  student_id = public.current_student_id()
  and status in ('draft', 'submitted')
  and score is null
  and feedback is null
  and marked_at is null
);

create policy submissions_instructor_update
on public.submissions
for update
to authenticated
using (
  marker_instructor_id = public.current_instructor_id()
  or exists (
    select 1
    from public.students
    where students.id = submissions.student_id
      and students.instructor_id = public.current_instructor_id()
  )
)
with check (
  marker_instructor_id = public.current_instructor_id()
  or exists (
    select 1
    from public.students
    where students.id = submissions.student_id
      and students.instructor_id = public.current_instructor_id()
  )
);

create policy submissions_admin_all
on public.submissions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy graduation_requests_select
on public.graduation_requests
for select
to authenticated
using (
  public.is_admin()
  or student_id = public.current_student_id()
  or requested_by_instructor_id = public.current_instructor_id()
);

create policy graduation_requests_instructor_insert
on public.graduation_requests
for insert
to authenticated
with check (
  requested_by_instructor_id = public.current_instructor_id()
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.students
    where students.id = graduation_requests.student_id
      and students.instructor_id = public.current_instructor_id()
  )
);

create policy graduation_requests_admin_update
on public.graduation_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy graduation_requests_admin_delete
on public.graduation_requests
for delete
to authenticated
using (public.is_admin());

create policy certificates_select
on public.certificates
for select
to authenticated
using (
  public.is_admin()
  or student_id = public.current_student_id()
);

create policy certificates_admin_insert
on public.certificates
for insert
to authenticated
with check (public.is_admin());

create policy certificates_admin_update
on public.certificates
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy certificates_admin_delete
on public.certificates
for delete
to authenticated
using (public.is_admin());

create function public.verify_certificate(input_code text)
returns table (
  verification_code text,
  student_name text,
  issued_at timestamptz,
  is_valid boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    certificates.verification_code,
    students.full_name,
    certificates.issued_at,
    certificates.revoked_at is null
  from public.certificates
  join public.students
    on students.id = certificates.student_id
  where lower(certificates.verification_code) = lower(trim(input_code))
  limit 1;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

grant select on public.news to anon;

create policy news_public_select
on public.news
for select
to anon, authenticated
using (
  is_published
  and published_at is not null
  and published_at <= now()
);

create policy news_admin_select
on public.news
for select
to authenticated
using (public.is_admin());

create policy news_admin_insert
on public.news
for insert
to authenticated
with check (public.is_admin());

create policy news_admin_update
on public.news
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy news_admin_delete
on public.news
for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'lesson-pdfs',
  'lesson-pdfs',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy lesson_files_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lesson-pdfs'
  and public.is_admin()
);

create policy lesson_files_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lesson-pdfs'
  and public.is_admin()
)
with check (
  bucket_id = 'lesson-pdfs'
  and public.is_admin()
);

create policy lesson_files_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lesson-pdfs'
  and public.is_admin()
);

create policy lesson_files_authorized_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lesson-pdfs'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.lessons
      where lessons.storage_path = storage.objects.name
        and lessons.is_published
    )
  )
);

commit;
