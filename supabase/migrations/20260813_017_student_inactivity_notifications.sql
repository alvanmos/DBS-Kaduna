begin;

alter table public.profiles
  add column if not exists inactivity_reactivation_token_hash text,
  add column if not exists inactivity_reactivation_expires_at timestamptz,
  add column if not exists inactivity_notice_sent_at timestamptz;

insert into public.automated_email_rules (
  rule_key, name, description, event_type, recipient_type, preference_category,
  subject_template, body_template
) values (
  'student_inactivity',
  'Student account inactive',
  'Student receives a secure reactivation link after 60 days without dashboard activity',
  'student_inactive',
  'student',
  'security',
  'Your Discover Bible School account is inactive',
  'Your student account has been marked inactive after 60 days without dashboard activity. If you would like to continue your studies, use the secure button below to reactivate your account. This link expires in 30 days.'
) on conflict (rule_key) do update set
  name = excluded.name,
  description = excluded.description,
  event_type = excluded.event_type,
  recipient_type = excluded.recipient_type,
  preference_category = excluded.preference_category,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template;

create or replace function public.enqueue_automated_email(input_rule_key text, input_recipient_profile_id uuid, input_source_record_id text, input_version text, input_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rule_record public.automated_email_rules; recipient public.profiles; prefs public.email_notification_preferences; queue_id uuid; allowed boolean := true; reason text := null; event_key text;
begin
  select * into rule_record from public.automated_email_rules where rule_key = input_rule_key;
  if not found then return null; end if;
  select * into recipient from public.profiles where id = input_recipient_profile_id and (status = 'active' or rule_record.preference_category = 'security');
  if not found then return null; end if;
  select * into prefs from public.email_notification_preferences where user_id = recipient.id;
  event_key := encode(extensions.digest(concat_ws('|',rule_record.id::text,coalesce(input_source_record_id,''),recipient.id::text,coalesce(input_version,'')), 'sha256'),'hex');
  if not rule_record.enabled then allowed := false; reason := 'automation_disabled';
  elsif recipient.email is null or recipient.email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then allowed := false; reason := 'invalid_or_missing_email';
  elsif rule_record.preference_category <> 'security' and coalesce(prefs.email_enabled,true) is false then allowed := false; reason := 'email_preference_disabled';
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

create or replace function public.process_student_inactivity(input_inactivity_days integer default 60)
returns table(inactivated_student_id uuid, inactivated_profile_id uuid)
language plpgsql security definer set search_path = '' as $$
declare candidate record; raw_token text;
begin
  if input_inactivity_days <> 60 then
    raise exception 'Student inactivity processing is fixed at 60 days';
  end if;

  for candidate in
    select s.id as student_id, p.id as profile_id, p.full_name, p.last_activity_at
    from public.students s
    join public.profiles p on p.id = s.profile_id
    where p.role = 'student'
      and p.status = 'active'
      and s.status = 'active'
      and p.last_activity_at <= now() - interval '60 days'
    for update of s, p skip locked
  loop
    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.profiles
    set status = 'inactive',
        inactivity_reactivation_token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
        inactivity_reactivation_expires_at = now() + interval '30 days',
        inactivity_notice_sent_at = now()
    where id = candidate.profile_id;
    update public.students set status = 'inactive' where id = candidate.student_id;
    perform public.enqueue_automated_email(
      'student_inactivity',
      candidate.profile_id,
      candidate.student_id::text,
      candidate.last_activity_at::text,
      jsonb_build_object(
        'student_full_name', coalesce(candidate.full_name, ''),
        'dashboard_link', '/login/student',
        'reactivation_link', '/api/register?reactivate=' || raw_token
      )
    );
    inactivated_student_id := candidate.student_id;
    inactivated_profile_id := candidate.profile_id;
    return next;
  end loop;
end;
$$;

create or replace function public.reactivate_student_account(input_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_profile_id uuid;
begin
  if input_token !~ '^[a-fA-F0-9]{64}$' then return false; end if;
  select p.id into target_profile_id
  from public.profiles p
  join public.students s on s.profile_id = p.id
  where p.role = 'student'
    and p.status = 'inactive'
    and s.status = 'inactive'
    and p.inactivity_reactivation_expires_at > now()
    and p.inactivity_reactivation_token_hash = encode(extensions.digest(input_token, 'sha256'), 'hex')
  for update of p, s;
  if not found then return false; end if;

  update public.profiles
  set status = 'active',
      last_activity_at = now(),
      inactivity_reactivation_token_hash = null,
      inactivity_reactivation_expires_at = null
  where id = target_profile_id;
  update public.students set status = 'active' where profile_id = target_profile_id;
  return true;
end;
$$;

revoke all on function public.process_student_inactivity(integer) from public, anon, authenticated;
revoke all on function public.reactivate_student_account(text) from public, anon, authenticated;

commit;
