begin;

-- A lesson must have at least one published question before it can be
-- submitted. Without this guard, a student could be marked "submitted" while
-- no answer rows were created, leaving nothing for their instructor to review.
create or replace function public.student_submit_lesson(
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
  published_question_count integer;
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

  select count(*)
  into published_question_count
  from public.questions
  where lesson_number = input_lesson_number
    and is_published;

  if published_question_count = 0 then
    raise exception 'This lesson has no published questions yet';
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

commit;
