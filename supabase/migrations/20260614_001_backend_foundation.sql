begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'instructor', 'student');
create type public.account_status as enum ('active', 'inactive');
create type public.approval_status as enum (
  'pending',
  'approved',
  'rejected'
);
create type public.student_milestone as enum (
  'studying',
  'awaiting_baptism',
  'baptized',
  'awaiting_graduation',
  'graduated'
);
create type public.lesson_file_status as enum ('not_uploaded', 'uploaded');
create type public.lesson_progress_status as enum (
  'not_started',
  'in_progress',
  'submitted',
  'completed'
);
create type public.question_kind as enum (
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay'
);
create type public.submission_status as enum (
  'draft',
  'submitted',
  'marked',
  'returned'
);
create type public.request_status as enum (
  'pending',
  'approved',
  'rejected'
);
create type public.news_media_type as enum ('text', 'photo', 'video');

create sequence public.student_serial_sequence start with 1;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'student',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_unique
  on public.profiles (lower(email))
  where email is not null;

create table public.instructor_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique
    references public.profiles (id) on delete cascade,
  whatsapp text not null,
  statement text,
  status public.approval_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique
    references public.profiles (id) on delete cascade,
  whatsapp text not null,
  max_student_load integer not null default 10
    check (max_student_load between 1 and 100),
  status public.account_status not null default 'active',
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique
    references public.profiles (id) on delete set null,
  serial_number text not null unique default (
    'DBS-KD-' ||
    lpad(nextval('public.student_serial_sequence')::text, 6, '0')
  ),
  full_name text not null,
  email text,
  whatsapp text,
  denomination text,
  is_adventist boolean not null default false,
  status public.account_status not null default 'active',
  milestone public.student_milestone not null default 'studying',
  instructor_id uuid
    references public.instructors (id) on delete set null,
  location_name text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  number smallint primary key check (number between 1 and 26),
  title text not null,
  file_status public.lesson_file_status not null default 'not_uploaded',
  storage_path text unique,
  original_file_name text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  lesson_number smallint not null
    references public.lessons (number) on delete cascade,
  kind public.question_kind not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  marker_instructor_id uuid
    references public.instructors (id) on delete set null,
  sort_order integer not null check (sort_order > 0),
  is_published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_lesson_order_unique
    unique (lesson_number, sort_order)
    deferrable initially deferred
);

create table public.question_answer_keys (
  question_id uuid primary key
    references public.questions (id) on delete cascade,
  answer jsonb not null,
  explanation text,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references public.students (id) on delete cascade,
  lesson_number smallint not null
    references public.lessons (number) on delete cascade,
  status public.lesson_progress_status not null default 'not_started',
  score numeric(5, 2) check (score between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_number)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references public.students (id) on delete cascade,
  question_id uuid not null
    references public.questions (id) on delete cascade,
  answer jsonb not null,
  status public.submission_status not null default 'draft',
  marker_instructor_id uuid
    references public.instructors (id) on delete set null,
  score numeric(5, 2) check (score between 0 and 100),
  feedback text,
  submitted_at timestamptz,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, question_id)
);

create table public.graduation_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references public.students (id) on delete cascade,
  requested_by_instructor_id uuid
    references public.instructors (id) on delete set null,
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index graduation_requests_one_pending_per_student
  on public.graduation_requests (student_id)
  where status = 'pending';

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references public.students (id) on delete restrict,
  verification_code text not null unique,
  issued_by uuid references public.profiles (id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  media_type public.news_media_type not null default 'text',
  media_storage_path text,
  is_published boolean not null default false,
  published_at timestamptz,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index students_instructor_id_index
  on public.students (instructor_id);
create index students_status_index
  on public.students (status);
create index students_milestone_index
  on public.students (milestone);
create index questions_lesson_number_index
  on public.questions (lesson_number);
create index submissions_marker_status_index
  on public.submissions (marker_instructor_id, status);
create index progress_student_index
  on public.student_lesson_progress (student_id);
create index certificates_student_index
  on public.certificates (student_id);
create index news_published_index
  on public.news (is_published, published_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'instructor_applications',
    'instructors',
    'students',
    'lessons',
    'questions',
    'question_answer_keys',
    'student_lesson_progress',
    'submissions',
    'graduation_requests',
    'certificates',
    'news'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I
       for each row execute function public.set_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.lessons (number, title) values
  (1, 'We Can Believe in God'),
  (2, 'We Can Believe the Bible'),
  (3, 'Does My Life Really Matter to God?'),
  (4, 'God''s Plan for My Life'),
  (5, 'The Bridge to a Satisfying Life'),
  (6, 'A Second Chance at Life'),
  (7, 'About Your Future'),
  (8, 'When Jesus Comes for You'),
  (9, 'Your Home in Heaven'),
  (10, 'How Soon Will Jesus Return?'),
  (11, 'Mysterious Power in My Life'),
  (12, 'An Ever-Present Saviour'),
  (13, 'From Guilty Sinner to Forgiven Saint'),
  (14, 'The Secret of Answered Prayer'),
  (15, 'The Secret of Happiness'),
  (16, 'The Secret of Heavenly Rest'),
  (17, 'The Secret of Growth Through Sharing'),
  (18, 'The Secret of a Healthy Lifestyle'),
  (19, 'Entering the Christian Life'),
  (20, 'The Secret of Growth Through Fellowship'),
  (21, 'Can the Majority Be Wrong?'),
  (22, 'Is God Fair?'),
  (23, 'What and Where Is Hell?'),
  (24, 'When a Person Dies... What Then?'),
  (25, 'Can I Find God''s Church Today?'),
  (26, 'Does God Have a Special Message for Our Day?');

alter table public.profiles enable row level security;
alter table public.instructor_applications enable row level security;
alter table public.instructors enable row level security;
alter table public.students enable row level security;
alter table public.lessons enable row level security;
alter table public.questions enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.student_lesson_progress enable row level security;
alter table public.submissions enable row level security;
alter table public.graduation_requests enable row level security;
alter table public.certificates enable row level security;
alter table public.news enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

commit;
