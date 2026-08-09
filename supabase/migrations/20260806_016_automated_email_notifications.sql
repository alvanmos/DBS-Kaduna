begin;

create table public.automated_email_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique check (rule_key ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null default '',
  event_type text not null,
  recipient_type text not null,
  preference_category text not null default 'custom',
  subject_template text not null,
  body_template text not null,
  enabled boolean not null default true,
  is_system boolean not null default true,
  allow_remarks boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  assignment_notifications boolean not null default true,
  lesson_notifications boolean not null default true,
  question_notifications boolean not null default true,
  class_notifications boolean not null default true,
  programme_notifications boolean not null default true,
  certificate_notifications boolean not null default true,
  custom_notifications boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.email_notification_queue (
  id uuid primary key default gen_random_uuid(),
  automation_rule_id uuid references public.automated_email_rules(id) on delete set null,
  event_type text not null,
  source_record_id text,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text,
  recipient_role text,
  event_payload jsonb not null default '{}'::jsonb,
  rendered_subject text,
  rendered_body text,
  unique_event_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  maximum_attempts integer not null default 4 check (maximum_attempts between 1 and 10),
  scheduled_for timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_notification_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.email_notification_queue(id) on delete cascade,
  automation_rule_id uuid references public.automated_email_rules(id) on delete set null,
  event_type text not null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_role text,
  recipient_email text,
  provider text not null default 'resend',
  provider_message_id text,
  delivery_status text not null,
  failure_reason text,
  attempt_number integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.email_notification_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  rule_id uuid references public.automated_email_rules(id) on delete set null,
  queue_id uuid references public.email_notification_queue(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index email_queue_ready_idx on public.email_notification_queue(status, scheduled_for);
create index email_queue_recipient_idx on public.email_notification_queue(recipient_profile_id, created_at desc);
create index email_logs_queue_idx on public.email_notification_logs(queue_id, created_at desc);

alter table public.automated_email_rules enable row level security;
alter table public.email_notification_preferences enable row level security;
alter table public.email_notification_queue enable row level security;
alter table public.email_notification_logs enable row level security;
alter table public.email_notification_audit_logs enable row level security;
revoke all on public.automated_email_rules, public.email_notification_preferences, public.email_notification_queue, public.email_notification_logs, public.email_notification_audit_logs from anon;
grant select, insert, update on public.automated_email_rules, public.email_notification_preferences, public.email_notification_queue, public.email_notification_logs, public.email_notification_audit_logs to authenticated;
create policy email_rules_admin_all on public.automated_email_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy email_preferences_owner on public.email_notification_preferences for all to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy email_queue_admin_read on public.email_notification_queue for select to authenticated using (public.is_admin());
create policy email_logs_admin_read on public.email_notification_logs for select to authenticated using (public.is_admin());
create policy email_audit_admin_read on public.email_notification_audit_logs for select to authenticated using (public.is_admin());

create trigger set_email_rules_updated_at before update on public.automated_email_rules for each row execute function public.set_updated_at();
create trigger set_email_preferences_updated_at before update on public.email_notification_preferences for each row execute function public.set_updated_at();
create trigger set_email_queue_updated_at before update on public.email_notification_queue for each row execute function public.set_updated_at();

insert into public.automated_email_rules(rule_key,name,description,event_type,recipient_type,preference_category,subject_template,body_template) values
('student_assignment_student','Instructor assigned','Student receives a new instructor notice','student_assigned','student','assignment','Your Discover Bible School instructor has been assigned','An instructor has been assigned to you. Log in to view your instructor''s details.'),
('student_assignment_instructor','Student assigned','Instructor receives a new student notice','student_assigned','assigned_instructor','assignment','A new Discover Bible School student has been assigned to you','A new student has been assigned to you. Log in to view the student''s details.'),
('student_reassignment_student','Instructor changed','Student receives an instructor change notice','student_reassigned','student','assignment','Your assigned Discover Bible School instructor has changed','Your assigned instructor has changed. Log in to view your new instructor.'),
('student_reassignment_previous_instructor','Student removed','Previous instructor receives a removal notice','student_reassigned','previous_instructor','assignment','A Discover Bible School student has been removed from your list','A student has been removed from your assigned-student list.'),
('lesson_submitted','Lesson submitted','Instructor receives a marking notice','lesson_submitted','assigned_instructor','lesson','Lesson {{lesson_number}} submitted for marking','A student has submitted Lesson {{lesson_number}} for marking. Log in to your instructor dashboard to review it.'),
('lesson_marked','Lesson marked','Student receives a result notice','lesson_marked','student','lesson','Your Lesson {{lesson_number}} submission has been marked','Your Lesson {{lesson_number}} submission has been marked. Log in to view your result and feedback.'),
('question_submitted','Question received','Instructor receives a student question notice','question_submitted','assigned_instructor','question','New question from a Discover Bible School student','You have received a new question from a student. Log in to Discover Bible School Kaduna to respond.'),
('question_answered','Question answered','Student receives an instructor reply notice','question_answered','student','question','Your Discover Bible School instructor has replied','Your instructor has replied to your question. Log in to view the response.'),
('class_scheduled','Class scheduled','Recipients receive a new class notice','class_scheduled','class_attendee','class','Discover Bible School class scheduled for {{class_date}}','Your Discover Bible School class is scheduled for {{class_date}} at {{class_time}}. Log in for the meeting details.'),
('class_rescheduled','Class rescheduled','Recipients receive a rescheduled class notice','class_rescheduled','class_attendee','class','Your Discover Bible School class has been rescheduled','Your Discover Bible School class has been rescheduled to {{class_date}} at {{class_time}}. Log in to view the updated details.'),
('class_cancelled','Class cancelled','Recipients receive a class cancellation notice','class_cancelled','class_attendee','class','Discover Bible School class cancelled','The Discover Bible School class scheduled for {{class_date}} has been cancelled.'),
('programme_completed_student','Programme completed','Student completion notice','programme_completed','student','programme','Congratulations on completing your Discover Bible School lessons','Congratulations! You have completed all required Discover Bible School lessons.'),
('programme_completed_instructor','Student completed programme','Assigned instructor completion notice','programme_completed','assigned_instructor','programme','A Discover Bible School student has completed the programme','A student has completed the Discover Bible School programme.'),
('programme_completed_administrator','Student completed programme','Administrator completion notice','programme_completed','administrator','programme','A Discover Bible School student has completed the programme','A student has completed the Discover Bible School programme.'),
('certificate_available','Certificate available','Student receives certificate availability notice','certificate_available','student','certificate','Your Discover Bible School Kaduna certificate is available','Congratulations! Your Discover Bible School Kaduna certificate is now available. Log in to download it.')
on conflict (rule_key) do nothing;

create or replace function public.enqueue_automated_email(input_rule_key text, input_recipient_profile_id uuid, input_source_record_id text, input_version text, input_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rule_record public.automated_email_rules; recipient public.profiles; prefs public.email_notification_preferences; queue_id uuid; allowed boolean := true; reason text := null; event_key text;
begin
  select * into rule_record from public.automated_email_rules where rule_key = input_rule_key;
  if not found then return null; end if;
  select * into recipient from public.profiles where id = input_recipient_profile_id and status = 'active';
  if not found then return null; end if;
  select * into prefs from public.email_notification_preferences where user_id = recipient.id;
  event_key := encode(extensions.digest(concat_ws('|',rule_record.id::text,coalesce(input_source_record_id,''),recipient.id::text,coalesce(input_version,'')), 'sha256'),'hex');
  if not rule_record.enabled then allowed := false; reason := 'automation_disabled';
  elsif recipient.email is null or recipient.email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then allowed := false; reason := 'invalid_or_missing_email';
  elsif coalesce(prefs.email_enabled,true) is false then allowed := false; reason := 'email_preference_disabled';
  elsif rule_record.preference_category = 'assignment' and coalesce(prefs.assignment_notifications,true) is false then allowed := false; reason := 'assignment_preference_disabled';
  elsif rule_record.preference_category = 'lesson' and coalesce(prefs.lesson_notifications,true) is false then allowed := false; reason := 'lesson_preference_disabled';
  elsif rule_record.preference_category = 'question' and coalesce(prefs.question_notifications,true) is false then allowed := false; reason := 'question_preference_disabled';
  elsif rule_record.preference_category = 'class' and coalesce(prefs.class_notifications,true) is false then allowed := false; reason := 'class_preference_disabled';
  elsif rule_record.preference_category = 'programme' and coalesce(prefs.programme_notifications,true) is false then allowed := false; reason := 'programme_preference_disabled';
  elsif rule_record.preference_category = 'certificate' and coalesce(prefs.certificate_notifications,true) is false then allowed := false; reason := 'certificate_preference_disabled'; end if;
  insert into public.email_notification_queue(automation_rule_id,event_type,source_record_id,recipient_profile_id,recipient_email,recipient_role,event_payload,unique_event_key,status,failure_reason)
  values(rule_record.id,rule_record.event_type,input_source_record_id,recipient.id,lower(recipient.email),recipient.role::text,coalesce(input_payload,'{}'::jsonb),event_key,case when allowed then 'pending' else 'skipped' end,reason)
  on conflict(unique_event_key) do nothing returning id into queue_id;
  if queue_id is not null then insert into public.email_notification_logs(queue_id,automation_rule_id,event_type,recipient_profile_id,recipient_role,recipient_email,delivery_status,failure_reason) values(queue_id,rule_record.id,rule_record.event_type,recipient.id,recipient.role::text,recipient.email,case when allowed then 'queued' else 'skipped' end,reason); end if;
  return queue_id;
end; $$;
revoke all on function public.enqueue_automated_email(text, uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.email_claim_notification_queue(input_limit integer default 20)
returns setof public.email_notification_queue language plpgsql security definer set search_path = '' as $$
begin
 return query with claimed as (select id from public.email_notification_queue where (status='pending' and scheduled_for<=now()) or (status='processing' and processing_started_at<now()-interval '15 minutes') order by scheduled_for limit greatest(1,least(input_limit,50)) for update skip locked) update public.email_notification_queue q set status='processing',processing_started_at=now(),attempt_count=q.attempt_count+1 from claimed where q.id=claimed.id returning q.*;
end; $$;
revoke all on function public.email_claim_notification_queue(integer) from public;
grant execute on function public.email_claim_notification_queue(integer) to service_role;

create or replace function public.email_assignment_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare student_profile uuid; previous_profile uuid; next_profile uuid;
begin
 if new.instructor_id is not distinct from old.instructor_id then return new; end if;
 select profile_id into student_profile from public.students where id=new.id;
 select profile_id into previous_profile from public.instructors where id=old.instructor_id;
 select profile_id into next_profile from public.instructors where id=new.instructor_id;
 if new.instructor_id is not null then
   perform public.enqueue_automated_email(case when old.instructor_id is null then 'student_assignment_student' else 'student_reassignment_student' end,student_profile,new.id::text,new.instructor_id::text,jsonb_build_object('dashboard_link','/student'));
   perform public.enqueue_automated_email('student_assignment_instructor',next_profile,new.id::text,new.instructor_id::text,jsonb_build_object('dashboard_link','/instructor'));
   if old.instructor_id is not null then perform public.enqueue_automated_email('student_reassignment_previous_instructor',previous_profile,new.id::text,old.instructor_id::text||':removed',jsonb_build_object('dashboard_link','/instructor')); end if;
 end if; return new;
end; $$;
create trigger email_student_assignment after update of instructor_id on public.students for each row execute function public.email_assignment_trigger();

create or replace function public.email_lesson_submission_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare student_record public.students; instructor_profile uuid; lesson_title text;
begin
 if new.status <> 'submitted' or (tg_op = 'UPDATE' and old.status = 'submitted') then return new; end if;
 select * into student_record from public.students where id = new.student_id;
 select profile_id into instructor_profile from public.instructors where id = student_record.instructor_id and status = 'active';
 select title into lesson_title from public.lessons where number = new.lesson_number;
 if instructor_profile is not null then perform public.enqueue_automated_email('lesson_submitted', instructor_profile, concat(new.student_id::text, ':', new.lesson_number::text), coalesce(new.started_at::text, now()::text), jsonb_build_object('lesson_number', new.lesson_number, 'lesson_title', coalesce(lesson_title, ''), 'dashboard_link', '/instructor')); end if;
 return new;
end; $$;
create trigger email_lesson_submitted after insert or update of status on public.student_lesson_progress for each row execute function public.email_lesson_submission_trigger();

create or replace function public.email_lesson_marked_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare student_profile uuid; lesson_number smallint; lesson_title text;
begin
 if new.status <> 'marked' or old.status = 'marked' then return new; end if;
 select profile_id into student_profile from public.students where id = new.student_id;
 select q.lesson_number, l.title into lesson_number, lesson_title from public.questions q join public.lessons l on l.number = q.lesson_number where q.id = new.question_id;
 if student_profile is not null then perform public.enqueue_automated_email('lesson_marked', student_profile, new.id::text, coalesce(new.marked_at::text, now()::text), jsonb_build_object('lesson_number', lesson_number, 'lesson_title', coalesce(lesson_title, ''), 'dashboard_link', '/student')); end if;
 return new;
end; $$;
create trigger email_lesson_marked after update of status on public.submissions for each row execute function public.email_lesson_marked_trigger();

create or replace function public.email_portal_message_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare sender_role public.app_role;
begin
 if new.channel <> 'student_instructor' or new.recipient_profile_id is null then return new; end if;
 select role into sender_role from public.profiles where id = new.sender_profile_id;
 if sender_role = 'student' then
   perform public.enqueue_automated_email('question_submitted', new.recipient_profile_id, new.id::text, new.created_at::text, jsonb_build_object('question_link', '/instructor'));
 elsif sender_role = 'instructor' then
   perform public.enqueue_automated_email('question_answered', new.recipient_profile_id, new.id::text, new.created_at::text, jsonb_build_object('question_link', '/student'));
 end if;
 return new;
end; $$;
create trigger email_portal_message_created after insert on public.portal_messages for each row execute function public.email_portal_message_trigger();

create or replace function public.email_programme_completion_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare student_record public.students; instructor_profile uuid; administrator_profile uuid; completion_version text;
begin
 if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status = 'completed') then return new; end if;
 if (select count(*) from public.student_lesson_progress where student_id = new.student_id and status = 'completed') < 26 then return new; end if;
 select * into student_record from public.students where id = new.student_id;
 completion_version := concat(new.lesson_number::text, ':', coalesce(new.completed_at::text, now()::text));
 perform public.enqueue_automated_email('programme_completed_student', student_record.profile_id, new.student_id::text, completion_version, jsonb_build_object('dashboard_link', '/student'));
 select profile_id into instructor_profile from public.instructors where id = student_record.instructor_id and status = 'active';
 if instructor_profile is not null then perform public.enqueue_automated_email('programme_completed_instructor', instructor_profile, new.student_id::text, completion_version, jsonb_build_object('dashboard_link', '/instructor')); end if;
 for administrator_profile in select id from public.profiles where role = 'admin' and status = 'active' loop
   perform public.enqueue_automated_email('programme_completed_administrator', administrator_profile, new.student_id::text, completion_version, jsonb_build_object('dashboard_link', '/admin'));
 end loop;
 return new;
end; $$;
create trigger email_programme_completed after insert or update of status on public.student_lesson_progress for each row execute function public.email_programme_completion_trigger();

alter table public.zoom_classes add column notification_event text not null default 'class_scheduled' check (notification_event in ('class_scheduled', 'class_rescheduled', 'class_cancelled'));
alter table public.zoom_classes add column notification_version text not null default '';

create or replace function public.email_zoom_class_event_before_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
   new.notification_event := 'class_cancelled';
   new.notification_version := coalesce(new.cancelled_at, now())::text;
 elsif new.scheduled_start is distinct from old.scheduled_start and new.status <> 'cancelled' then
   new.notification_event := 'class_rescheduled';
   new.notification_version := new.scheduled_start::text;
 end if;
 return new;
end; $$;
create trigger email_zoom_class_event_before_update before update of scheduled_start, status on public.zoom_classes for each row execute function public.email_zoom_class_event_before_update();

create or replace function public.email_zoom_class_event_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare instructor_profile uuid; attendee record; event_rule text; event_version text; payload jsonb;
begin
 if tg_op = 'UPDATE' and not ((new.status = 'cancelled' and old.status is distinct from 'cancelled') or new.scheduled_start is distinct from old.scheduled_start) then return new; end if;
 event_rule := new.notification_event;
 if event_rule not in ('class_scheduled', 'class_rescheduled', 'class_cancelled') then return new; end if;
 event_version := case when tg_op = 'INSERT' then coalesce(nullif(new.notification_version, ''), new.created_at::text) else new.notification_version end;
 payload := jsonb_build_object('class_date', to_char(timezone('Africa/Lagos', new.scheduled_start), 'DD Mon YYYY'), 'class_time', to_char(timezone('Africa/Lagos', new.scheduled_start), 'HH12:MI AM'), 'class_link', '/student', 'dashboard_link', '/instructor');
 select profile_id into instructor_profile from public.instructors where id = new.instructor_id and status = 'active';
 if instructor_profile is not null then perform public.enqueue_automated_email(event_rule, instructor_profile, new.id::text, event_version, payload || jsonb_build_object('dashboard_link', '/instructor')); end if;
 if event_rule = 'class_cancelled' then
   for attendee in select s.profile_id from public.zoom_class_attendees a join public.students s on s.id = a.student_id where a.zoom_class_id = new.id loop
     perform public.enqueue_automated_email(event_rule, attendee.profile_id, new.id::text, event_version, payload || jsonb_build_object('dashboard_link', '/student'));
   end loop;
 end if;
 return new;
end; $$;
create trigger email_zoom_class_event after insert or update of scheduled_start, status on public.zoom_classes for each row execute function public.email_zoom_class_event_trigger();

create or replace function public.email_zoom_class_attendee_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare class_record public.zoom_classes; student_profile uuid; event_version text; payload jsonb;
begin
 select * into class_record from public.zoom_classes where id = new.zoom_class_id;
 if not found or class_record.notification_event not in ('class_scheduled', 'class_rescheduled') then return new; end if;
 select profile_id into student_profile from public.students where id = new.student_id;
 event_version := coalesce(nullif(class_record.notification_version, ''), class_record.created_at::text);
 payload := jsonb_build_object('class_date', to_char(timezone('Africa/Lagos', class_record.scheduled_start), 'DD Mon YYYY'), 'class_time', to_char(timezone('Africa/Lagos', class_record.scheduled_start), 'HH12:MI AM'), 'class_link', '/student', 'dashboard_link', '/student');
 if student_profile is not null then perform public.enqueue_automated_email(class_record.notification_event, student_profile, class_record.id::text, event_version, payload); end if;
 return new;
end; $$;
create trigger email_zoom_class_attendee_created after insert on public.zoom_class_attendees for each row execute function public.email_zoom_class_attendee_trigger();

create or replace function public.email_certificate_trigger() returns trigger language plpgsql security definer set search_path = '' as $$ declare recipient uuid; begin if new.storage_path is not null and (tg_op='INSERT' or old.storage_path is null) then select profile_id into recipient from public.students where id=new.student_id; perform public.enqueue_automated_email('certificate_available',recipient,new.id::text,new.storage_path,jsonb_build_object('certificate_link','/student')); end if; return new; end; $$;
create trigger email_certificate_available after insert or update of storage_path on public.certificates for each row execute function public.email_certificate_trigger();

commit;
