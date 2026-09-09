-- Allow administrators to leave durable feedback while reviewing a pending answer.
create or replace function public.admin_comment_on_submission(
  input_submission_id uuid,
  input_feedback text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if char_length(trim(coalesce(input_feedback, ''))) not between 1 and 2000 then
    raise exception 'Enter a comment between 1 and 2000 characters';
  end if;

  update public.submissions submission
  set feedback = trim(input_feedback)
  where submission.id = input_submission_id
    and submission.status in ('submitted', 'marked')
    and exists (
      select 1
      from public.questions question
      where question.id = submission.question_id
        and question.kind::text <> 'thought'
    );

  if not found then
    raise exception 'This gradeable submission is no longer available for comment';
  end if;
end;
$$;

revoke all on function public.admin_comment_on_submission(uuid, text) from public;
grant execute on function public.admin_comment_on_submission(uuid, text) to authenticated;
