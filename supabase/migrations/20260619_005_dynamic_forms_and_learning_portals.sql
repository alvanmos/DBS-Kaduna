alter type public.lesson_progress_status
  add value if not exists 'returned' after 'submitted';

begin;

alter table public.profiles
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.students
  add column if not exists address text,
  add column if not exists registration_data jsonb not null default '{}'::jsonb;

alter table public.instructors
  add column if not exists address text,
  add column if not exists registration_data jsonb not null default '{}'::jsonb;

alter table public.student_lesson_progress
  add column if not exists is_locked boolean not null default true;

update public.student_lesson_progress
set is_locked = false
where lesson_number = 1
   or status <> 'not_started';

create table public.registration_forms (
  id uuid primary key default gen_random_uuid(),
  recruitment_kind public.recruitment_kind not null unique,
  title text not null,
  description text not null default '',
  fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(fields) = 'array'),
  is_published boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.registration_forms (
  recruitment_kind,
  title,
  description,
  fields,
  is_published
)
values
  (
    'student',
    'Register as a Student',
    'Begin the free Discover Bible School correspondence course and grow through 26 guided lessons.',
    '[
      {"key":"full_name","label":"Full name","type":"text","required":true,"system":true},
      {"key":"email","label":"Email address","type":"email","required":true,"system":true},
      {"key":"phone","label":"Phone number","type":"tel","required":true,"system":true},
      {"key":"address","label":"Residential address","type":"textarea","required":true,"system":true},
      {"key":"denomination","label":"Denomination","type":"text","required":false},
      {"key":"is_adventist","label":"Are you a Seventh-day Adventist?","type":"checkbox","required":false}
    ]'::jsonb,
    true
  ),
  (
    'volunteer_instructor',
    'Register as a Volunteer Instructor',
    'Join DBS Kaduna in guiding students through their Bible study journey.',
    '[
      {"key":"full_name","label":"Full name","type":"text","required":true,"system":true},
      {"key":"email","label":"Email address","type":"email","required":true,"system":true},
      {"key":"phone","label":"Phone number","type":"tel","required":true,"system":true},
      {"key":"address","label":"Residential address","type":"textarea","required":true,"system":true},
      {"key":"statement","label":"Why would you like to volunteer?","type":"textarea","required":true}
    ]'::jsonb,
    true
  )
on conflict (recruitment_kind) do nothing;

create table public.volunteer_registrations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.recruitment_campaigns (id) on delete set null,
  enrolment_id uuid references public.recruitment_enrolments (id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  address text,
  form_data jsonb not null default '{}'::jsonb,
  status public.approval_status not null default 'pending',
  instructor_id uuid references public.instructors (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index volunteer_registrations_pending_email_unique
  on public.volunteer_registrations (lower(email))
  where status = 'pending';

alter table public.recruitment_enrolments
  add column if not exists email text,
  add column if not exists form_data jsonb not null default '{}'::jsonb,
  add column if not exists student_id uuid
    references public.students (id) on delete set null,
  add column if not exists instructor_id uuid
    references public.instructors (id) on delete set null;

create index profiles_last_activity_index
  on public.profiles (last_activity_at);
create index volunteer_registrations_status_index
  on public.volunteer_registrations (status, created_at desc);

create trigger registration_forms_set_updated_at
before update on public.registration_forms
for each row execute function public.set_updated_at();

create trigger volunteer_registrations_set_updated_at
before update on public.volunteer_registrations
for each row execute function public.set_updated_at();

alter table public.registration_forms enable row level security;
alter table public.volunteer_registrations enable row level security;

grant select on public.registration_forms to anon, authenticated;
grant insert, update, delete on public.registration_forms to authenticated;
grant select, update, delete on public.volunteer_registrations to authenticated;

create policy registration_forms_public_select
on public.registration_forms
for select
to anon, authenticated
using (is_published);

create policy registration_forms_admin_select
on public.registration_forms
for select
to authenticated
using (public.is_admin());

create policy registration_forms_admin_insert
on public.registration_forms
for insert
to authenticated
with check (public.is_admin());

create policy registration_forms_admin_update
on public.registration_forms
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy registration_forms_admin_delete
on public.registration_forms
for delete
to authenticated
using (public.is_admin());

create policy volunteer_registrations_admin_select
on public.volunteer_registrations
for select
to authenticated
using (public.is_admin());

create policy volunteer_registrations_admin_update
on public.volunteer_registrations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy volunteer_registrations_admin_delete
on public.volunteer_registrations
for delete
to authenticated
using (public.is_admin());

create policy profiles_student_assigned_instructor_select
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.instructors
    join public.students
      on students.instructor_id = instructors.id
    where instructors.profile_id = profiles.id
      and students.profile_id = auth.uid()
  )
);

drop policy if exists lessons_authenticated_select on public.lessons;
create policy lessons_authenticated_select
on public.lessons
for select
to authenticated
using (true);

drop policy if exists recruitment_campaigns_public_select
  on public.recruitment_campaigns;
revoke select on public.recruitment_campaigns from anon;

create function public.get_public_recruitment_campaign(input_slug text)
returns table (
  id uuid,
  recruitment_kind public.recruitment_kind,
  slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    recruitment_campaigns.id,
    recruitment_campaigns.recruitment_kind,
    recruitment_campaigns.slug
  from public.recruitment_campaigns
  where recruitment_campaigns.slug = trim(input_slug)
    and recruitment_campaigns.is_active
  limit 1;
$$;

revoke all on function public.get_public_recruitment_campaign(text) from public;
grant execute on function public.get_public_recruitment_campaign(text)
  to anon, authenticated;

create function public.touch_my_activity()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_time timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set last_activity_at = activity_time
  where id = auth.uid();

  return activity_time;
end;
$$;

revoke all on function public.touch_my_activity() from public;
grant execute on function public.touch_my_activity() to authenticated;

create policy progress_instructor_update
on public.student_lesson_progress
for update
to authenticated
using (
  exists (
    select 1
    from public.students
    where students.id = student_lesson_progress.student_id
      and students.instructor_id = public.current_instructor_id()
  )
)
with check (
  exists (
    select 1
    from public.students
    where students.id = student_lesson_progress.student_id
      and students.instructor_id = public.current_instructor_id()
  )
);

create function public.student_submit_lesson(
  input_lesson_number smallint,
  input_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_record public.students;
  question_record public.questions;
  answer_value jsonb;
begin
  select * into student_record
  from public.students
  where profile_id = auth.uid();

  if not found then
    raise exception 'Student account not found';
  end if;

  if input_lesson_number > 1 and not exists (
    select 1
    from public.student_lesson_progress
    where student_id = student_record.id
      and lesson_number = input_lesson_number
  ) then
    raise exception 'This lesson is locked';
  end if;

  if exists (
    select 1
    from public.student_lesson_progress
    where student_id = student_record.id
      and lesson_number = input_lesson_number
      and is_locked
  ) then
    raise exception 'This lesson is locked';
  end if;

  for question_record in
    select * from public.questions
    where lesson_number = input_lesson_number
      and is_published
    order by sort_order
  loop
    answer_value := input_answers -> question_record.id::text;
    if answer_value is null
      or answer_value = 'null'::jsonb
      or trim(both '"' from answer_value::text) = '' then
      raise exception 'Answer every question before submitting';
    end if;

    if exists (
      select 1 from public.submissions
      where student_id = student_record.id
        and question_id = question_record.id
        and status not in ('draft', 'returned')
    ) then
      raise exception 'This lesson has already been submitted';
    end if;

    insert into public.submissions (
      student_id,
      question_id,
      answer,
      status,
      marker_instructor_id,
      submitted_at,
      score,
      feedback,
      marked_at
    )
    values (
      student_record.id,
      question_record.id,
      answer_value,
      'submitted',
      student_record.instructor_id,
      now(),
      null,
      null,
      null
    )
    on conflict (student_id, question_id) do update
    set
      answer = excluded.answer,
      status = 'submitted',
      marker_instructor_id = excluded.marker_instructor_id,
      submitted_at = now(),
      score = null,
      feedback = null,
      marked_at = null;
  end loop;

  insert into public.student_lesson_progress (
    student_id,
    lesson_number,
    status,
    is_locked,
    started_at
  )
  values (
    student_record.id,
    input_lesson_number,
    'submitted',
    false,
    now()
  )
  on conflict (student_id, lesson_number) do update
  set status = 'submitted', is_locked = false, started_at = coalesce(
    public.student_lesson_progress.started_at,
    now()
  );

  perform public.touch_my_activity();
end;
$$;

revoke all on function public.student_submit_lesson(smallint, jsonb) from public;
grant execute on function public.student_submit_lesson(smallint, jsonb)
  to authenticated;

create function public.instructor_set_lesson_lock(
  input_student_id uuid,
  input_lesson_number smallint,
  input_locked boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.students
    where id = input_student_id
      and instructor_id = public.current_instructor_id()
  ) then
    raise exception 'Student is not assigned to this instructor';
  end if;

  insert into public.student_lesson_progress (
    student_id,
    lesson_number,
    status,
    is_locked
  )
  values (
    input_student_id,
    input_lesson_number,
    'not_started',
    input_locked
  )
  on conflict (student_id, lesson_number) do update
  set is_locked = input_locked;

  perform public.touch_my_activity();
end;
$$;

revoke all
  on function public.instructor_set_lesson_lock(uuid, smallint, boolean)
  from public;
grant execute
  on function public.instructor_set_lesson_lock(uuid, smallint, boolean)
  to authenticated;

create function public.instructor_review_submission(
  input_submission_id uuid,
  input_score numeric,
  input_feedback text,
  input_status public.submission_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if input_status not in ('marked', 'returned') then
    raise exception 'Review status must be marked or returned';
  end if;

  update public.submissions
  set
    score = input_score,
    feedback = nullif(trim(input_feedback), ''),
    status = input_status,
    marked_at = now(),
    marker_instructor_id = public.current_instructor_id()
  where id = input_submission_id
    and exists (
      select 1 from public.students
      where students.id = submissions.student_id
        and students.instructor_id = public.current_instructor_id()
    );

  if not found then
    raise exception 'Submission is not assigned to this instructor';
  end if;

  perform public.touch_my_activity();
end;
$$;

revoke all
  on function public.instructor_review_submission(
    uuid,
    numeric,
    text,
    public.submission_status
  )
  from public;
grant execute
  on function public.instructor_review_submission(
    uuid,
    numeric,
    text,
    public.submission_status
  )
  to authenticated;

create function public.instructor_set_lesson_result(
  input_student_id uuid,
  input_lesson_number smallint,
  input_result public.lesson_progress_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  average_score numeric(5, 2);
begin
  if input_result not in ('returned', 'completed') then
    raise exception 'Lesson result must be returned or completed';
  end if;

  if not exists (
    select 1 from public.students
    where id = input_student_id
      and instructor_id = public.current_instructor_id()
  ) then
    raise exception 'Student is not assigned to this instructor';
  end if;

  select avg(submissions.score)
  into average_score
  from public.submissions
  join public.questions on questions.id = submissions.question_id
  where submissions.student_id = input_student_id
    and questions.lesson_number = input_lesson_number;

  insert into public.student_lesson_progress (
    student_id,
    lesson_number,
    status,
    score,
    completed_at,
    is_locked
  )
  values (
    input_student_id,
    input_lesson_number,
    input_result,
    average_score,
    case when input_result = 'completed' then now() else null end,
    false
  )
  on conflict (student_id, lesson_number) do update
  set
    status = input_result,
    score = average_score,
    completed_at = case when input_result = 'completed' then now() else null end,
    is_locked = false;

  if input_result = 'returned' then
    update public.submissions
    set status = 'returned'
    where student_id = input_student_id
      and question_id in (
        select id from public.questions
        where lesson_number = input_lesson_number
      );
  elsif input_lesson_number < 26 then
    insert into public.student_lesson_progress (
      student_id,
      lesson_number,
      status,
      is_locked
    )
    values (
      input_student_id,
      input_lesson_number + 1,
      'not_started',
      false
    )
    on conflict (student_id, lesson_number) do update
    set is_locked = false;
  end if;

  perform public.touch_my_activity();
end;
$$;

revoke all
  on function public.instructor_set_lesson_result(
    uuid,
    smallint,
    public.lesson_progress_status
  )
  from public;
grant execute
  on function public.instructor_set_lesson_result(
    uuid,
    smallint,
    public.lesson_progress_status
  )
  to authenticated;

create or replace function public.admin_issue_certificate(input_student_id uuid)
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
    select 1 from public.students
    where id = input_student_id
      and (
        milestone in ('awaiting_graduation', 'graduated')
        or (
          select count(*) from public.student_lesson_progress
          where student_id = input_student_id
            and status = 'completed'
        ) = 26
      )
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

  update public.students
  set milestone = 'graduated'
  where id = input_student_id;

  update public.graduation_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where student_id = input_student_id
    and status = 'pending';

  return certificate_record;
end;
$$;

commit;
