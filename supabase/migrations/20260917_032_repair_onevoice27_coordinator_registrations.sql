-- Repair the Adventist Literature Network coordinator registration workflow.
-- Only auth users explicitly registered through the literature workflow belong
-- in public.literature_coordinators.

alter table public.literature_coordinators
  add column if not exists registration_source text;

alter table public.literature_coordinators
  alter column registration_source set default 'legacy_unverified';

update public.literature_coordinators
set registration_source = 'legacy_unverified'
where registration_source is null;

-- Keep legitimate literature-network registrations visible and restore their
-- profile role if the old trigger created the row without updating the profile.
update public.literature_coordinators coordinator
set registration_source = 'onevoice27'
from auth.users auth_user
where coordinator.profile_id = auth_user.id
  and coalesce(auth_user.raw_user_meta_data ->> 'onevoice_role', '') = 'coordinator';

update public.profiles profile
set full_name = trim(coalesce(nullif(auth_user.raw_user_meta_data ->> 'full_name', ''), profile.full_name, '')),
    role = 'coordinator'
from auth.users auth_user
where profile.id = auth_user.id
  and coalesce(auth_user.raw_user_meta_data ->> 'onevoice_role', '') = 'coordinator';

-- Recover coordinator accounts whose auth user exists but whose old trigger
-- did not create a literature_coordinators row.
insert into public.literature_coordinators (
  profile_id,
  name,
  whatsapp,
  email,
  church_address,
  account_status,
  registration_source
)
select
  auth_user.id,
  trim(coalesce(nullif(auth_user.raw_user_meta_data ->> 'full_name', ''), profile.full_name, '')),
  nullif(trim(auth_user.raw_user_meta_data ->> 'whatsapp'), ''),
  lower(auth_user.email),
  nullif(trim(auth_user.raw_user_meta_data ->> 'church_address'), ''),
  'pending',
  'onevoice27'
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where coalesce(auth_user.raw_user_meta_data ->> 'onevoice_role', '') = 'coordinator'
  and not exists (
    select 1
    from public.literature_coordinators existing
    where existing.profile_id = auth_user.id
  )
on conflict (profile_id) do update
set registration_source = 'onevoice27';

-- Quarantine rows created by the previous NULL-sensitive trigger. They remain
-- recoverable in the table but can no longer appear in this workflow.
update public.literature_coordinators
set registration_source = 'legacy_unverified',
    account_status = 'disabled'
where registration_source <> 'onevoice27';

alter table public.literature_coordinators
  alter column registration_source set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'literature_coordinators_registration_source_check'
      and conrelid = 'public.literature_coordinators'::regclass
  ) then
    alter table public.literature_coordinators
      add constraint literature_coordinators_registration_source_check
      check (registration_source in ('onevoice27', 'legacy_unverified'));
  end if;
end;
$$;

create index if not exists literature_coordinators_registration_source_idx
  on public.literature_coordinators(registration_source, created_at desc);

create or replace function public.onevoice_register_coordinator_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A normal DBS student has no onevoice_role key. coalesce is required so
  -- that NULL does not bypass this early-return guard.
  if coalesce(new.raw_user_meta_data ->> 'onevoice_role', '') <> 'coordinator' then
    return new;
  end if;

  update public.profiles
  set full_name = trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')),
      role = 'coordinator'
  where id = new.id;

  insert into public.literature_coordinators (
    profile_id,
    name,
    whatsapp,
    email,
    church_address,
    account_status,
    registration_source
  ) values (
    new.id,
    trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')),
    nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), ''),
    lower(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'church_address'), ''),
    'pending',
    'onevoice27'
  )
  on conflict (profile_id) do update
    set registration_source = 'onevoice27';

  return new;
end;
$$;

-- Migration 028 already attached zz_onevoice_register_coordinator to this
-- function. CREATE OR REPLACE keeps that trigger connected to the repaired
-- function without taking an AccessExclusiveLock on auth.users. Dropping and
-- recreating the live auth trigger here can deadlock with an in-flight signup.

create or replace function public.onevoice_is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.literature_coordinators
    where profile_id = auth.uid()
      and registration_source = 'onevoice27'
      and account_status = 'active'
  );
$$;

create or replace function public.onevoice_current_coordinator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.literature_coordinators
  where profile_id = auth.uid()
    and registration_source = 'onevoice27'
    and account_status = 'active'
  limit 1;
$$;

drop policy if exists literature_coordinators_self_or_admin on public.literature_coordinators;
create policy literature_coordinators_self_or_admin
on public.literature_coordinators for select to authenticated
using (
  (registration_source = 'onevoice27' and profile_id = auth.uid())
  or public.onevoice_is_admin()
);

drop policy if exists literature_coordinators_admin_write on public.literature_coordinators;
create policy literature_coordinators_admin_write
on public.literature_coordinators for all to authenticated
using (public.onevoice_is_admin())
with check (public.onevoice_is_admin() and registration_source = 'onevoice27');

create or replace function public.onevoice_set_coordinator_status(input_coordinator_id uuid, input_status text)
returns public.literature_coordinators
language plpgsql
security definer
set search_path = ''
as $$
declare coordinator_record public.literature_coordinators;
begin
  if not public.onevoice_is_admin() then
    raise exception 'Administrator access required';
  end if;
  if input_status not in ('active','suspended','disabled') then
    raise exception 'Choose a valid coordinator status';
  end if;
  update public.literature_coordinators
  set account_status = input_status,
      approved_by = case when input_status = 'active' then auth.uid() else approved_by end,
      approved_at = case when input_status = 'active' then now() else approved_at end
  where id = input_coordinator_id
    and registration_source = 'onevoice27'
  returning * into coordinator_record;
  if not found then
    raise exception 'Coordinator application not found';
  end if;
  return coordinator_record;
end;
$$;

revoke all on function public.onevoice_is_coordinator() from public;
grant execute on function public.onevoice_is_coordinator() to authenticated;
