-- Keep shared DBS accounts separate from OneVoice27 coordinator registrations.
-- The OneVoice coordinator trigger is opt-in: only auth users created with
-- raw_user_meta_data.onevoice_role = 'coordinator' belong in this workflow.

alter table public.literature_coordinators
  add column if not exists registration_source text;

alter table public.literature_coordinators
  alter column registration_source set default 'legacy_unverified';

update public.literature_coordinators
set registration_source = 'legacy_unverified'
where registration_source is null;

-- Recover legitimate OneVoice27 registrations before quarantining rows created
-- by the old NULL-sensitive trigger guard.
update public.literature_coordinators coordinator
set registration_source = 'onevoice27'
from auth.users auth_user
where coordinator.profile_id = auth_user.id
  and coalesce(auth_user.raw_user_meta_data ->> 'onevoice_role', '') = 'coordinator';

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
  -- coalesce is required here: a normal DBS student has no onevoice_role key,
  -- so a bare NULL comparison would not enter the early-return branch.
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

drop policy if exists literature_requests_participant_or_admin on public.literature_requests;
create policy literature_requests_participant_or_admin
on public.literature_requests for select to authenticated
using (
  public.onevoice_is_admin()
  or evangelist_id = public.onevoice_current_evangelist_id()
  or coordinator_id = public.onevoice_current_coordinator_id()
  or exists (
    select 1
    from public.literature_sources source
    where source.id = source_id and source.profile_id = auth.uid()
  )
);

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
