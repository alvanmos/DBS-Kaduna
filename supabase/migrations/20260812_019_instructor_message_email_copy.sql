begin;

update public.automated_email_rules
set
  name = 'Instructor message received',
  description = 'Student receives an alert when their assigned instructor sends a private message.',
  subject_template = 'New message from your Discover Bible School instructor',
  body_template = 'Your Discover Bible School instructor has sent you a new private message. Log in to your student dashboard to read and reply.'
where rule_key = 'question_answered';

commit;
