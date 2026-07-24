begin;

create type public.recruitment_kind as enum (
  'student',
  'volunteer_instructor'
);

create table public.recruitment_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  recruitment_kind public.recruitment_kind not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recruitment_enrolments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.recruitment_campaigns (id) on delete set null,
  recruitment_kind public.recruitment_kind not null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null check (char_length(trim(phone)) between 7 and 30),
  address text not null check (char_length(trim(address)) between 4 and 500),
  submitted_at timestamptz not null default now()
);

create index recruitment_enrolments_campaign_idx
  on public.recruitment_enrolments (campaign_id, submitted_at desc);

alter table public.recruitment_campaigns enable row level security;
alter table public.recruitment_enrolments enable row level security;

grant select on public.recruitment_campaigns to anon, authenticated;
grant select, insert, update, delete
  on public.recruitment_campaigns
  to authenticated;
grant select, delete on public.recruitment_enrolments to authenticated;

create policy recruitment_campaigns_public_select
on public.recruitment_campaigns
for select
to anon, authenticated
using (is_active);

create policy recruitment_campaigns_admin_select
on public.recruitment_campaigns
for select
to authenticated
using (public.is_admin());

create policy recruitment_campaigns_admin_insert
on public.recruitment_campaigns
for insert
to authenticated
with check (public.is_admin());

create policy recruitment_campaigns_admin_update
on public.recruitment_campaigns
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy recruitment_campaigns_admin_delete
on public.recruitment_campaigns
for delete
to authenticated
using (public.is_admin());

create policy recruitment_enrolments_admin_select
on public.recruitment_enrolments
for select
to authenticated
using (public.is_admin());

create policy recruitment_enrolments_admin_delete
on public.recruitment_enrolments
for delete
to authenticated
using (public.is_admin());

create function public.submit_recruitment_enrolment(
  campaign_slug text,
  enrolment_kind public.recruitment_kind,
  enrollee_name text,
  enrollee_phone text,
  enrollee_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_record public.recruitment_campaigns;
  enrolment_id uuid;
begin
  if nullif(trim(enrollee_name), '') is null
    or nullif(trim(enrollee_phone), '') is null
    or nullif(trim(enrollee_address), '') is null then
    raise exception 'Name, phone number, and address are required';
  end if;

  if nullif(trim(campaign_slug), '') is not null then
    select *
    into campaign_record
    from public.recruitment_campaigns
    where slug = trim(campaign_slug)
      and is_active;

    if not found then
      raise exception 'This recruitment campaign is not available';
    end if;

    if campaign_record.recruitment_kind <> enrolment_kind then
      raise exception 'This campaign does not match the selected registration type';
    end if;
  end if;

  insert into public.recruitment_enrolments (
    campaign_id,
    recruitment_kind,
    full_name,
    phone,
    address
  )
  values (
    campaign_record.id,
    enrolment_kind,
    trim(enrollee_name),
    trim(enrollee_phone),
    trim(enrollee_address)
  )
  returning id into enrolment_id;

  return enrolment_id;
end;
$$;

revoke all
  on function public.submit_recruitment_enrolment(
    text,
    public.recruitment_kind,
    text,
    text,
    text
  )
  from public;
grant execute
  on function public.submit_recruitment_enrolment(
    text,
    public.recruitment_kind,
    text,
    text,
    text
  )
  to anon, authenticated;

commit;
