begin;

-- Zoom credentials are deliberately stored only in encrypted server-managed columns.
create table public.zoom_accounts (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null unique references public.instructors(id) on delete cascade,
  zoom_account_id text not null,
  zoom_user_id text not null,
  zoom_email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  connection_status text not null default 'connected' check (connection_status in ('connected', 'disconnected', 'error')),
  connection_error text,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zoom_classes (
  id uuid primary key default gen_random_uuid(),
  meeting_id text not null unique,
  meeting_uuid text,
  topic text not null check (char_length(trim(topic)) between 2 and 200),
  lesson_number smallint not null references public.lessons(number) on delete restrict,
  instructor_id uuid not null references public.instructors(id) on delete restrict,
  zoom_account_id uuid not null references public.zoom_accounts(id) on delete restrict,
  scheduled_start timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  participant_join_url text not null,
  host_start_url_encrypted text,
  instructions text,
  status text not null default 'upcoming' check (status in ('upcoming', 'ongoing', 'completed', 'cancelled', 'deactivated')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zoom_class_attendees (
  id uuid primary key default gen_random_uuid(),
  zoom_class_id uuid not null references public.zoom_classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_status text not null default 'not_joined' check (attendance_status in ('not_joined', 'joined', 'completed', 'absent')),
  joined_at timestamptz,
  left_at timestamptz,
  total_minutes integer check (total_minutes is null or total_minutes >= 0),
  joined_late boolean not null default false,
  left_early boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zoom_class_id, student_id)
);

create table public.zoom_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  meeting_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create table public.zoom_unmatched_participants (
  id uuid primary key default gen_random_uuid(),
  zoom_class_id uuid not null references public.zoom_classes(id) on delete cascade,
  participant_email text,
  zoom_participant_id text,
  payload jsonb not null,
  resolved_student_id uuid references public.students(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.zoom_operation_errors (
  id uuid primary key default gen_random_uuid(),
  instructor_profile_id uuid references public.profiles(id) on delete set null,
  zoom_class_id uuid references public.zoom_classes(id) on delete set null,
  operation text not null,
  error_message text not null,
  created_at timestamptz not null default now()
);
create table public.zoom_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index zoom_classes_instructor_start_idx on public.zoom_classes(instructor_id, scheduled_start desc);
create index zoom_classes_status_start_idx on public.zoom_classes(status, scheduled_start desc);
create index zoom_classes_meeting_id_idx on public.zoom_classes(meeting_id);
create index zoom_attendees_student_idx on public.zoom_class_attendees(student_id, zoom_class_id);
create index zoom_events_meeting_idx on public.zoom_webhook_events(meeting_id, received_at desc);
create index zoom_errors_created_idx on public.zoom_operation_errors(created_at desc);

alter table public.zoom_accounts enable row level security;
alter table public.zoom_classes enable row level security;
alter table public.zoom_class_attendees enable row level security;
alter table public.zoom_webhook_events enable row level security;
alter table public.zoom_unmatched_participants enable row level security;
alter table public.zoom_operation_errors enable row level security;
alter table public.zoom_audit_log enable row level security;
revoke all on public.zoom_accounts, public.zoom_classes, public.zoom_class_attendees, public.zoom_webhook_events, public.zoom_unmatched_participants, public.zoom_operation_errors, public.zoom_audit_log from anon, authenticated;

-- Browser clients receive only class metadata. Token and host-link fields have no SELECT policy.
create policy zoom_classes_instructor_read on public.zoom_classes for select to authenticated using (instructor_id = public.current_instructor_id());
create policy zoom_classes_student_read on public.zoom_classes for select to authenticated using (exists (select 1 from public.zoom_class_attendees a where a.zoom_class_id = id and a.student_id = public.current_student_id()));
create policy zoom_classes_admin_read on public.zoom_classes for select to authenticated using (public.is_admin());
create policy zoom_attendees_instructor_read on public.zoom_class_attendees for select to authenticated using (exists (select 1 from public.zoom_classes c where c.id = zoom_class_id and c.instructor_id = public.current_instructor_id()));
create policy zoom_attendees_student_read on public.zoom_class_attendees for select to authenticated using (student_id = public.current_student_id());
create policy zoom_attendees_admin_read on public.zoom_class_attendees for select to authenticated using (public.is_admin());
create policy zoom_errors_admin_read on public.zoom_operation_errors for select to authenticated using (public.is_admin());
create policy zoom_audit_admin_read on public.zoom_audit_log for select to authenticated using (public.is_admin());

create trigger set_zoom_accounts_updated_at before update on public.zoom_accounts for each row execute function public.set_updated_at();
create trigger set_zoom_classes_updated_at before update on public.zoom_classes for each row execute function public.set_updated_at();
create trigger set_zoom_attendees_updated_at before update on public.zoom_class_attendees for each row execute function public.set_updated_at();

-- Preserve useful historical schedule metadata, but deliberately omit legacy room IDs/links.
create table public.legacy_online_class_archive (
  id uuid primary key,
  title text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null,
  participant_profile_ids uuid[] not null default '{}',
  archived_at timestamptz not null default now()
);
insert into public.legacy_online_class_archive (id, title, description, created_by, scheduled_start, scheduled_end, status, participant_profile_ids)
select m.id, m.title, m.description, m.created_by, m.scheduled_start, m.scheduled_end, m.status,
  coalesce(array_agg(p.user_id) filter (where p.user_id is not null), '{}')
from public.meeting_schedules m
left join public.meeting_participants p on p.meeting_id = m.id
group by m.id;
alter table public.legacy_online_class_archive enable row level security;
revoke all on public.legacy_online_class_archive from anon, authenticated;
create policy legacy_online_class_archive_admin_read on public.legacy_online_class_archive for select to authenticated using (public.is_admin());

-- Retire the previous browser-embedded room records and scheduling surface.
drop table if exists public.meeting_participants cascade;
drop table if exists public.meeting_schedules cascade;
drop table if exists public.calls cascade;

commit;
