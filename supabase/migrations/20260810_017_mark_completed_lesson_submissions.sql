-- A completed lesson is the instructor's final marking decision for every
-- submitted answer in that lesson. Keep individual submission state aligned
-- so it can never re-enter an unmarked queue.

create or replace function public.instructor_set_lesson_result(
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
    student_id, lesson_number, status, score, completed_at, is_locked
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
  else
    update public.submissions
    set
      status = 'marked',
      marked_at = coalesce(marked_at, now()),
      marker_instructor_id = coalesce(marker_instructor_id, public.current_instructor_id())
    where student_id = input_student_id
      and status = 'submitted'
      and question_id in (
        select id from public.questions
        where lesson_number = input_lesson_number
      );

    if input_lesson_number < 26 then
      insert into public.student_lesson_progress (
        student_id, lesson_number, status, is_locked
      )
      values (input_student_id, input_lesson_number + 1, 'not_started', false)
      on conflict (student_id, lesson_number) do update
      set is_locked = false;
    end if;
  end if;

  perform public.touch_my_activity();
end;
$$;

-- Do not send one result email per question when a lesson is completed as a
-- single action. Individual question reviews retain their existing notice.
create or replace function public.email_lesson_marked_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_profile uuid;
  marked_lesson_number smallint;
  lesson_title text;
begin
  if new.status <> 'marked' or old.status = 'marked' then return new; end if;

  select q.lesson_number, l.title
  into marked_lesson_number, lesson_title
  from public.questions q
  join public.lessons l on l.number = q.lesson_number
  where q.id = new.question_id;

  if exists (
    select 1
    from public.student_lesson_progress
    where student_id = new.student_id
      and lesson_number = marked_lesson_number
      and status = 'completed'
  ) then
    return new;
  end if;

  select profile_id into student_profile from public.students where id = new.student_id;
  if student_profile is not null then
    perform public.enqueue_automated_email(
      'lesson_marked',
      student_profile,
      new.id::text,
      coalesce(new.marked_at::text, now()::text),
      jsonb_build_object(
        'lesson_number', marked_lesson_number,
        'lesson_title', coalesce(lesson_title, ''),
        'dashboard_link', '/student'
      )
    );
  end if;
  return new;
end;
$$;

-- Reconcile submissions from lessons completed before this rule existed.
update public.submissions submission
set
  status = 'marked',
  marked_at = coalesce(submission.marked_at, progress.completed_at, now()),
  marker_instructor_id = coalesce(submission.marker_instructor_id, student.instructor_id)
from public.questions question
join public.student_lesson_progress progress
  on progress.lesson_number = question.lesson_number
join public.students student
  on student.id = progress.student_id
where submission.question_id = question.id
  and submission.student_id = progress.student_id
  and submission.status = 'submitted'
  and progress.status = 'completed';
