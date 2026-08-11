begin;

insert into public.automated_email_rules (
  rule_key,
  name,
  description,
  event_type,
  recipient_type,
  preference_category,
  subject_template,
  body_template
)
values (
  'admin_message_instructor',
  'Administrator message',
  'Instructor receives an alert when DBS Kaduna administration sends a private message.',
  'admin_message',
  'instructor',
  'custom',
  'New message from Discover Bible School Kaduna administration',
  'You have received a new private message from DBS Kaduna administration. Log in to your instructor dashboard to read and reply.'
)
on conflict (rule_key) do nothing;

create or replace function public.email_portal_message_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_role public.app_role;
begin
  if new.recipient_profile_id is null then
    return new;
  end if;

  select role
  into sender_role
  from public.profiles
  where id = new.sender_profile_id;

  if new.channel = 'student_instructor' and sender_role = 'student' then
    perform public.enqueue_automated_email(
      'question_submitted',
      new.recipient_profile_id,
      new.id::text,
      new.created_at::text,
      jsonb_build_object('question_link', '/instructor')
    );
  elsif new.channel = 'student_instructor' and sender_role = 'instructor' then
    perform public.enqueue_automated_email(
      'question_answered',
      new.recipient_profile_id,
      new.id::text,
      new.created_at::text,
      jsonb_build_object('question_link', '/student')
    );
  elsif new.channel = 'admin_instructor' and sender_role = 'admin' then
    perform public.enqueue_automated_email(
      'admin_message_instructor',
      new.recipient_profile_id,
      new.id::text,
      new.created_at::text,
      jsonb_build_object('dashboard_link', '/instructor')
    );
  end if;

  return new;
end;
$$;

commit;
