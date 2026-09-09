-- Allow active administrators to finalise a submitted lesson and notify the
-- responsible volunteer instructor in one transaction.
create or replace function public.admin_complete_lesson_and_notify(
  input_student_id uuid,
  input_lesson_number smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_record public.students;
  instructor_record public.instructors;
  average_score numeric(5, 2);
  marked_submission_count integer := 0;
  notification_body text;
  notification_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if input_lesson_number not between 1 and 26 then
    raise exception 'Choose a valid lesson number';
  end if;

  select *
  into student_record
  from public.students
  where id = input_student_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active student not found';
  end if;

  if student_record.instructor_id is null then
    raise exception 'Assign a volunteer instructor before completing this lesson';
  end if;

  select *
  into instructor_record
  from public.instructors
  where id = student_record.instructor_id
    and status = 'active';

  if not found then
    raise exception 'The assigned volunteer instructor is not active';
  end if;

  if not exists (
    select 1
    from public.submissions submission
    join public.questions question on question.id = submission.question_id
    where submission.student_id = student_record.id
      and question.lesson_number = input_lesson_number
      and submission.status = 'submitted'
      and question.kind::text <> 'thought'
  ) then
    raise exception 'There are no gradeable submissions awaiting completion for this lesson';
  end if;

  select avg(submission.score)
  into average_score
  from public.submissions submission
  join public.questions question on question.id = submission.question_id
  where submission.student_id = student_record.id
    and question.lesson_number = input_lesson_number;

  insert into public.student_lesson_progress (
    student_id, lesson_number, status, score, completed_at, is_locked
  )
  values (
    student_record.id, input_lesson_number, 'completed', average_score, now(), false
  )
  on conflict (student_id, lesson_number) do update
  set
    status = 'completed',
    score = excluded.score,
    completed_at = now(),
    is_locked = false;

  update public.submissions
  set
    status = 'marked',
    marked_at = coalesce(marked_at, now()),
    marker_instructor_id = coalesce(marker_instructor_id, instructor_record.id)
  where student_id = student_record.id
    and status = 'submitted'
    and question_id in (
      select id
      from public.questions
      where lesson_number = input_lesson_number
    );
  get diagnostics marked_submission_count = row_count;

  if input_lesson_number < 26 then
    insert into public.student_lesson_progress (
      student_id, lesson_number, status, is_locked
    )
    values (
      student_record.id, input_lesson_number + 1, 'not_started', false
    )
    on conflict (student_id, lesson_number) do update
    set is_locked = false;
  end if;

  notification_body := format(
    'Greetings in the name of our Lord and Saviour Jesus Christ.\n\nTo ensure the continued progress of our students, the **Discover Bible School (DBS) Kaduna Administration** has reviewed your student’s submission and marked **Lesson %s** as **completed** for **%s**.\n\nInstructors are kindly encouraged to assess and provide feedback on their students’ lesson submissions promptly to ensure steady progress through the course.\n\nThank you for your faithful service and commitment to helping our students grow in the knowledge of God’s Word.\n\n**DBS Kaduna Administration**',
    input_lesson_number,
    student_record.full_name
  );

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
    notification_body
  )
  returning id into notification_id;

  return jsonb_build_object(
    'student_name', student_record.full_name,
    'lesson_number', input_lesson_number,
    'marked_submissions', marked_submission_count,
    'notification_id', notification_id
  );
end;
$$;

revoke all on function public.admin_complete_lesson_and_notify(uuid, smallint) from public;
grant execute on function public.admin_complete_lesson_and_notify(uuid, smallint) to authenticated;
