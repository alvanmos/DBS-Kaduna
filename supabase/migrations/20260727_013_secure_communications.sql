begin;

-- Communication records store auth profile IDs. Meeting rooms are generated client-side
-- with cryptographically random UUIDs and are never derived from personal information.
create table if not exists public.communication_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  can_make_calls boolean not null default true,
  can_receive_calls boolean not null default true,
  allow_phone_fallback boolean not null default true,
  allow_sms_fallback boolean not null default true,
  student_calls_enabled boolean not null default false,
  max_recording_seconds integer not null default 180 check (max_recording_seconds between 15 and 600),
  max_recording_bytes integer not null default 25165824 check (max_recording_bytes between 1048576 and 104857600),
  updated_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  call_type text not null check (call_type in ('audio', 'video')),
  meeting_room text not null unique check (char_length(meeting_room) between 24 and 120),
  status text not null default 'calling' check (status in ('calling', 'ringing', 'accepted', 'rejected', 'busy', 'cancelled', 'missed', 'completed', 'failed')),
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  initiated_by_role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (caller_id <> recipient_id)
);

create index if not exists calls_caller_created_idx on public.calls(caller_id, created_at desc);
create index if not exists calls_recipient_status_idx on public.calls(recipient_id, status, created_at desc);

create table if not exists public.meeting_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 120),
  description text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  call_type text not null default 'video' check (call_type in ('audio', 'video')),
  meeting_room text not null unique check (char_length(meeting_room) between 24 and 120),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create index if not exists meeting_schedules_creator_start_idx on public.meeting_schedules(created_by, scheduled_start);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meeting_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invitation_status text not null default 'pending' check (invitation_status in ('pending', 'accepted', 'declined', 'cancelled')),
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique(meeting_id, user_id)
);
create index if not exists meeting_participants_user_idx on public.meeting_participants(user_id, meeting_id);

create table if not exists public.recorded_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  media_type text not null check (media_type in ('audio', 'video')),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.webm$'),
  duration_seconds integer not null check (duration_seconds between 1 and 600),
  file_size integer not null check (file_size between 1 and 104857600),
  status text not null default 'pending_upload' check (status in ('pending_upload', 'uploaded', 'failed', 'deleted')),
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists recorded_messages_recipient_created_idx on public.recorded_messages(recipient_id, created_at desc);

create table if not exists public.communication_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  reported_user_id uuid references public.profiles(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  details text not null check (char_length(trim(details)) between 5 and 2000),
  created_at timestamptz not null default now()
);

alter table public.communication_settings enable row level security;
alter table public.calls enable row level security;
alter table public.meeting_schedules enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.recorded_messages enable row level security;
alter table public.communication_reports enable row level security;

create or replace function public.communication_can_contact(actor_id uuid, target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select actor_id is not null and target_id is not null and actor_id <> target_id and (
    exists (select 1 from public.profiles where id = actor_id and role = 'admin' and status = 'active')
    or exists (
      select 1 from public.instructors i
      join public.students s on s.instructor_id = i.id
      where i.profile_id = actor_id and s.profile_id = target_id and i.status = 'active' and s.status = 'active'
    )
    or exists (
      select 1 from public.students s
      join public.instructors i on i.id = s.instructor_id
      where s.profile_id = actor_id and i.profile_id = target_id and s.status = 'active' and i.status = 'active'
    )
    or (
      exists (select 1 from public.profiles where id = actor_id and role = 'student' and status = 'active')
      and exists (select 1 from public.profiles where id = target_id and role = 'admin' and status = 'active')
    )
  );
$$;

create or replace function public.communication_my_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile_id', auth.uid(),
    'can_make_calls', coalesce(s.can_make_calls, true),
    'can_receive_calls', coalesce(s.can_receive_calls, true),
    'student_calls_enabled', coalesce(s.student_calls_enabled, false)
  ) from (select auth.uid() as id) me
  left join public.communication_settings s on s.user_id = me.id;
$$;

create or replace function public.communication_my_contacts()
returns jsonb language sql stable security definer set search_path = '' as $$
  with eligible as (
    select p.id, p.full_name, p.role::text as contact_role, p.phone, coalesce(s.allow_phone_fallback, true) as allow_phone_fallback, coalesce(s.allow_sms_fallback, true) as allow_sms_fallback
    from public.profiles p left join public.communication_settings s on s.user_id = p.id
    where p.status = 'active' and public.communication_can_contact(auth.uid(), p.id)
  ) select coalesce(jsonb_agg(to_jsonb(eligible) order by full_name), '[]'::jsonb) from eligible;
$$;

create or replace function public.communication_start_call(input_recipient_id uuid, input_call_type text, input_meeting_room text)
returns public.calls language plpgsql security definer set search_path = '' as $$
declare caller_settings public.communication_settings; recipient_settings public.communication_settings; created_call public.calls; caller_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_call_type not in ('audio', 'video') or input_meeting_room !~ '^dbs-[0-9a-f]{32}$' then raise exception 'Invalid call request'; end if;
  select role into caller_role from public.profiles where id = auth.uid() and status = 'active';
  if caller_role is null or not public.communication_can_contact(auth.uid(), input_recipient_id) then raise exception 'You do not have permission to contact this person'; end if;
  select * into caller_settings from public.communication_settings where user_id = auth.uid();
  select * into recipient_settings from public.communication_settings where user_id = input_recipient_id;
  if coalesce(caller_settings.can_make_calls, true) is false or coalesce(recipient_settings.can_receive_calls, true) is false then raise exception 'Calling is not available for this contact'; end if;
  if caller_role = 'student' and coalesce(caller_settings.student_calls_enabled, false) is false and not exists (select 1 from public.profiles where id = input_recipient_id and role = 'admin') then raise exception 'Student-initiated calls are currently disabled'; end if;
  insert into public.calls(caller_id, recipient_id, call_type, meeting_room, initiated_by_role, status) values (auth.uid(), input_recipient_id, input_call_type, input_meeting_room, caller_role, 'ringing') returning * into created_call;
  return created_call;
end;
$$;

create or replace function public.communication_respond_to_call(input_call_id uuid, input_action text)
returns public.calls language plpgsql security definer set search_path = '' as $$
declare updated_call public.calls;
begin
  if input_action not in ('accepted', 'rejected') then raise exception 'Invalid response'; end if;
  update public.calls set status = input_action, answered_at = case when input_action = 'accepted' then now() else null end, started_at = case when input_action = 'accepted' then now() else null end, ended_at = case when input_action = 'rejected' then now() else null end, updated_at = now() where id = input_call_id and recipient_id = auth.uid() and status in ('calling', 'ringing') returning * into updated_call;
  if updated_call.id is null then raise exception 'This call can no longer be answered'; end if;
  return updated_call;
end;
$$;

create or replace function public.communication_end_call(input_call_id uuid)
returns public.calls language plpgsql security definer set search_path = '' as $$
declare updated_call public.calls;
begin
  update public.calls set status = case when status = 'accepted' then 'completed' else 'cancelled' end, ended_at = now(), duration_seconds = case when started_at is null then null else greatest(0, extract(epoch from now() - started_at)::integer) end, updated_at = now() where id = input_call_id and (caller_id = auth.uid() or recipient_id = auth.uid()) and status in ('calling', 'ringing', 'accepted') returning * into updated_call;
  if updated_call.id is null then raise exception 'This call is no longer active'; end if;
  return updated_call;
end;
$$;

create or replace function public.communication_schedule_meeting(input_title text, input_description text, input_scheduled_start timestamptz, input_scheduled_end timestamptz, input_call_type text, input_meeting_room text, input_participant_ids jsonb)
returns public.meeting_schedules language plpgsql security definer set search_path = '' as $$
declare created_meeting public.meeting_schedules; participant_id uuid;
begin
  if auth.uid() is null or input_call_type not in ('audio','video') or input_meeting_room !~ '^dbs-[0-9a-f]{32}$' or input_scheduled_start <= now() or input_scheduled_end <= input_scheduled_start then raise exception 'Invalid meeting details'; end if;
  if jsonb_typeof(input_participant_ids) <> 'array' or jsonb_array_length(input_participant_ids) = 0 then raise exception 'Select at least one eligible participant'; end if;
  for participant_id in select value::text::uuid from jsonb_array_elements(input_participant_ids) loop
    if not public.communication_can_contact(auth.uid(), participant_id) then raise exception 'One or more selected participants are not eligible'; end if;
  end loop;
  insert into public.meeting_schedules(title, description, created_by, scheduled_start, scheduled_end, call_type, meeting_room) values (trim(input_title), nullif(trim(input_description), ''), auth.uid(), input_scheduled_start, input_scheduled_end, input_call_type, input_meeting_room) returning * into created_meeting;
  insert into public.meeting_participants(meeting_id, user_id) select created_meeting.id, value::text::uuid from jsonb_array_elements(input_participant_ids);
  return created_meeting;
end;
$$;

create or replace function public.communication_cancel_meeting(input_meeting_id uuid)
returns public.meeting_schedules language plpgsql security definer set search_path = '' as $$
declare updated_meeting public.meeting_schedules;
begin
  update public.meeting_schedules set status = 'cancelled', updated_at = now() where id = input_meeting_id and status = 'scheduled' and (created_by = auth.uid() or public.is_admin()) returning * into updated_meeting;
  if updated_meeting.id is null then raise exception 'This meeting cannot be cancelled'; end if;
  update public.meeting_participants set invitation_status = 'cancelled' where meeting_id = input_meeting_id;
  return updated_meeting;
end;
$$;

create or replace function public.communication_my_calls()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'caller_id', c.caller_id, 'recipient_id', c.recipient_id, 'call_type', c.call_type, 'meeting_room', c.meeting_room, 'status', c.status, 'created_at', c.created_at, 'started_at', c.started_at, 'duration_seconds', c.duration_seconds, 'caller_name', caller.full_name, 'other_party_name', case when c.caller_id = auth.uid() then recipient.full_name else caller.full_name end) order by c.created_at desc), '[]'::jsonb)
  from public.calls c join public.profiles caller on caller.id = c.caller_id join public.profiles recipient on recipient.id = c.recipient_id
  where c.caller_id = auth.uid() or c.recipient_id = auth.uid() or public.is_admin();
$$;

create or replace function public.communication_my_meetings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'description', m.description, 'created_by', m.created_by, 'scheduled_start', m.scheduled_start, 'scheduled_end', m.scheduled_end, 'call_type', m.call_type, 'meeting_room', m.meeting_room, 'status', m.status) order by m.scheduled_start), '[]'::jsonb)
  from public.meeting_schedules m where m.created_by = auth.uid() or public.is_admin() or exists (select 1 from public.meeting_participants mp where mp.meeting_id = m.id and mp.user_id = auth.uid());
$$;

create or replace function public.communication_my_recorded_messages()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) from public.recorded_messages r where r.sender_id = auth.uid() or r.recipient_id = auth.uid() or public.is_admin();
$$;

create or replace function public.communication_create_recorded_message(input_recipient_id uuid, input_media_type text, input_storage_path text, input_duration_seconds integer, input_file_size integer)
returns public.recorded_messages language plpgsql security definer set search_path = '' as $$
declare created_message public.recorded_messages; settings public.communication_settings;
begin
  if not public.communication_can_contact(auth.uid(), input_recipient_id) or input_media_type not in ('audio','video') or input_storage_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\\.webm$') then raise exception 'Invalid recorded message'; end if;
  select * into settings from public.communication_settings where user_id = auth.uid();
  if input_duration_seconds < 1 or input_duration_seconds > coalesce(settings.max_recording_seconds, 180) or input_file_size < 1 or input_file_size > coalesce(settings.max_recording_bytes, 25165824) then raise exception 'Recording exceeds the configured limit'; end if;
  insert into public.recorded_messages(sender_id, recipient_id, media_type, storage_path, duration_seconds, file_size) values (auth.uid(), input_recipient_id, input_media_type, input_storage_path, input_duration_seconds, input_file_size) returning * into created_message;
  return created_message;
end;
$$;

create or replace function public.communication_mark_recorded_message_uploaded(input_message_id uuid)
returns public.recorded_messages language plpgsql security definer set search_path = '' as $$
declare updated_message public.recorded_messages;
begin
  update public.recorded_messages set status = 'uploaded' where id = input_message_id and sender_id = auth.uid() and status = 'pending_upload' returning * into updated_message;
  if updated_message.id is null then raise exception 'Recorded message could not be updated'; end if;
  return updated_message;
end;
$$;

create or replace function public.communication_can_access_recording(path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.recorded_messages r where r.storage_path = path and r.status = 'uploaded' and (r.sender_id = auth.uid() or r.recipient_id = auth.uid() or public.is_admin()));
$$;

create policy communication_settings_owner_or_admin on public.communication_settings for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy communication_settings_admin_update on public.communication_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy communication_reports_owner_or_admin on public.communication_reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy communication_reports_owner_insert on public.communication_reports for insert to authenticated with check (reporter_id = auth.uid());

insert into storage.buckets(id, name, public) values ('communication-recordings', 'communication-recordings', false) on conflict (id) do update set public = false;
create policy communication_recordings_private_select on storage.objects for select to authenticated using (bucket_id = 'communication-recordings' and public.communication_can_access_recording(name));
create policy communication_recordings_sender_upload on storage.objects for insert to authenticated with check (bucket_id = 'communication-recordings' and exists (select 1 from public.recorded_messages r where r.storage_path = name and r.sender_id = auth.uid() and r.status = 'pending_upload'));
create policy communication_recordings_sender_delete on storage.objects for delete to authenticated using (bucket_id = 'communication-recordings' and exists (select 1 from public.recorded_messages r where r.storage_path = name and r.sender_id = auth.uid()));

revoke all on function public.communication_can_contact(uuid, uuid), public.communication_my_settings(), public.communication_my_contacts(), public.communication_start_call(uuid, text, text), public.communication_respond_to_call(uuid, text), public.communication_end_call(uuid), public.communication_schedule_meeting(text, text, timestamptz, timestamptz, text, text, jsonb), public.communication_cancel_meeting(uuid), public.communication_my_calls(), public.communication_my_meetings(), public.communication_my_recorded_messages(), public.communication_create_recorded_message(uuid, text, text, integer, integer), public.communication_mark_recorded_message_uploaded(uuid), public.communication_can_access_recording(text) from public;

grant execute on function public.communication_can_contact(uuid, uuid), public.communication_my_settings(), public.communication_my_contacts(), public.communication_start_call(uuid, text, text), public.communication_respond_to_call(uuid, text), public.communication_end_call(uuid), public.communication_schedule_meeting(text, text, timestamptz, timestamptz, text, text, jsonb), public.communication_cancel_meeting(uuid), public.communication_my_calls(), public.communication_my_meetings(), public.communication_my_recorded_messages(), public.communication_create_recorded_message(uuid, text, text, integer, integer), public.communication_mark_recorded_message_uploaded(uuid), public.communication_can_access_recording(text) to authenticated;

alter publication supabase_realtime add table public.calls, public.meeting_participants, public.recorded_messages;
commit;
