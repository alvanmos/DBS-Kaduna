-- Allow administrators to save a mark and feedback while reviewing a gradeable answer.
create or replace function public.admin_review_submission(
  input_submission_id uuid,
  input_score numeric,
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

  if input_score is not null and (input_score < 0 or input_score > 100) then
    raise exception 'Enter a mark between 0 and 100';
  end if;

  if input_score is null and char_length(trim(coalesce(input_feedback, ''))) = 0 then
    raise exception 'Enter a mark or comment before saving the review';
  end if;

  if char_length(trim(coalesce(input_feedback, ''))) > 2000 then
    raise exception 'Comments cannot exceed 2000 characters';
  end if;

  update public.submissions submission
  set
    score = input_score,
    feedback = nullif(trim(input_feedback), '')
  where submission.id = input_submission_id
    and submission.status in ('submitted', 'marked')
    and exists (
      select 1
      from public.questions question
      where question.id = submission.question_id
        and question.kind::text <> 'thought'
    );

  if not found then
    raise exception 'This gradeable submission is no longer available for review';
  end if;
end;
$$;

revoke all on function public.admin_review_submission(uuid, numeric, text) from public;
grant execute on function public.admin_review_submission(uuid, numeric, text) to authenticated;
