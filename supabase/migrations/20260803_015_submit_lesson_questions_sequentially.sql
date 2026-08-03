begin;

create or replace function public.student_submit_lesson_question(
  input_lesson_number smallint,
  input_question_id uuid,
  input_answer jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_record public.students;
  question_record public.questions;
  remaining_questions integer;
begin
  select * into student_record
  from public.students
  where profile_id = auth.uid();

  if not found then
    raise exception 'Student account not found';
  end if;

  if input_lesson_number > 1 and not exists (
    select 1 from public.student_lesson_progress
    where student_id = student_record.id and lesson_number = input_lesson_number
  ) then
    raise exception 'This lesson is locked';
  end if;

  if exists (
    select 1 from public.student_lesson_progress
    where student_id = student_record.id and lesson_number = input_lesson_number and is_locked
  ) then
    raise exception 'This lesson is locked';
  end if;

  select * into question_record
  from public.questions
  where id = input_question_id
    and lesson_number = input_lesson_number
    and is_published;

  if not found then
    raise exception 'This question is not available';
  end if;

  if input_answer is null or input_answer = 'null'::jsonb or trim(both '"' from input_answer::text) = '' then
    raise exception 'Enter an answer before submitting';
  end if;

  if exists (
    select 1
    from public.questions previous_question
    where previous_question.lesson_number = input_lesson_number
      and previous_question.is_published
      and previous_question.sort_order < question_record.sort_order
      and not exists (
        select 1 from public.submissions submission
        where submission.student_id = student_record.id
          and submission.question_id = previous_question.id
          and submission.status in ('submitted', 'marked')
      )
  ) then
    raise exception 'Submit each earlier question before continuing';
  end if;

  if exists (
    select 1 from public.submissions
    where student_id = student_record.id
      and question_id = question_record.id
      and status not in ('draft', 'returned')
  ) then
    raise exception 'This question has already been submitted';
  end if;

  insert into public.submissions (
    student_id, question_id, answer, status, marker_instructor_id, submitted_at, score, feedback, marked_at
  ) values (
    student_record.id, question_record.id, input_answer, 'submitted', student_record.instructor_id, now(), null, null, null
  ) on conflict (student_id, question_id) do update set
    answer = excluded.answer,
    status = 'submitted',
    marker_instructor_id = excluded.marker_instructor_id,
    submitted_at = now(),
    score = null,
    feedback = null,
    marked_at = null;

  select count(*) into remaining_questions
  from public.questions question
  where question.lesson_number = input_lesson_number
    and question.is_published
    and not exists (
      select 1 from public.submissions submission
      where submission.student_id = student_record.id
        and submission.question_id = question.id
        and submission.status in ('submitted', 'marked')
    );

  insert into public.student_lesson_progress (student_id, lesson_number, status, is_locked, started_at)
  values (
    student_record.id,
    input_lesson_number,
    (case when remaining_questions = 0 then 'submitted' else 'in_progress' end)::public.lesson_progress_status,
    false,
    now()
  )
  on conflict (student_id, lesson_number) do update set
    status = (case when remaining_questions = 0 then 'submitted' else 'in_progress' end)::public.lesson_progress_status,
    is_locked = false,
    started_at = coalesce(public.student_lesson_progress.started_at, now());

  perform public.touch_my_activity();
end;
$$;

revoke all on function public.student_submit_lesson_question(smallint, uuid, jsonb) from public;
grant execute on function public.student_submit_lesson_question(smallint, uuid, jsonb) to authenticated;

commit;
