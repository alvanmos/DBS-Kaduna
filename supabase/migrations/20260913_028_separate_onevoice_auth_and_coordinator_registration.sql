-- Separate OneVoice27 account onboarding and give approved coordinators request access.

alter table public.literature_coordinators
  add column if not exists name text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists church_address text,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.literature_coordinators alter column state drop not null;
alter table public.literature_coordinators alter column account_status set default 'pending';
alter table public.literature_coordinators drop constraint if exists literature_coordinators_account_status_check;
alter table public.literature_coordinators
  add constraint literature_coordinators_account_status_check
  check (account_status in ('pending','active','suspended','disabled'));

update public.literature_coordinators coordinator
set email = coalesce(coordinator.email, profile.email),
    name = coalesce(coordinator.name, profile.full_name)
from public.profiles profile
where profile.id = coordinator.profile_id
  and (coordinator.email is null or coordinator.name is null);

create or replace function public.onevoice_register_coordinator_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'onevoice_role' <> 'coordinator' then
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
    account_status
  ) values (
    new.id,
    trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')),
    nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), ''),
    lower(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'church_address'), ''),
    'pending'
  )
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists zz_onevoice_register_coordinator on auth.users;
create trigger zz_onevoice_register_coordinator
after insert on auth.users
for each row execute function public.onevoice_register_coordinator_from_auth_user();

create or replace function public.onevoice_current_coordinator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.literature_coordinators
  where profile_id = auth.uid() and account_status = 'active'
  limit 1;
$$;

alter table public.literature_requests
  add column if not exists coordinator_id uuid references public.literature_coordinators(id) on delete restrict;
alter table public.literature_requests alter column evangelist_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'literature_requests_requester_check'
      and conrelid = 'public.literature_requests'::regclass
  ) then
    alter table public.literature_requests
      add constraint literature_requests_requester_check
      check (num_nonnulls(evangelist_id, coordinator_id) = 1);
  end if;
end;
$$;

create index if not exists literature_requests_coordinator_idx
  on public.literature_requests(coordinator_id, created_at desc);

drop policy if exists literature_requests_participant_or_admin on public.literature_requests;
create policy literature_requests_participant_or_admin
on public.literature_requests for select to authenticated
using (
  public.is_admin()
  or evangelist_id = public.onevoice_current_evangelist_id()
  or coordinator_id = public.onevoice_current_coordinator_id()
  or exists (
    select 1 from public.literature_sources source
    where source.id = source_id and source.profile_id = auth.uid()
  )
  or exists (
    select 1 from public.literature_coordinators coordinator
    where coordinator.profile_id = auth.uid()
      and coordinator.account_status = 'active'
      and coordinator.state = prospect_state
      and (coordinator.lga_city is null or coordinator.lga_city = prospect_lga_city)
  )
);

drop policy if exists literature_history_participant_or_admin on public.literature_request_status_history;
create policy literature_history_participant_or_admin
on public.literature_request_status_history for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.literature_requests request
    where request.id = request_id
      and (
        request.evangelist_id = public.onevoice_current_evangelist_id()
        or request.coordinator_id = public.onevoice_current_coordinator_id()
        or exists (
          select 1 from public.literature_sources source
          where source.id = request.source_id and source.profile_id = auth.uid()
        )
      )
  )
);

drop policy if exists literature_confirmations_participant_or_admin on public.literature_distribution_confirmations;
create policy literature_confirmations_participant_or_admin
on public.literature_distribution_confirmations for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.literature_requests request
    where request.id = request_id
      and (
        request.evangelist_id = public.onevoice_current_evangelist_id()
        or request.coordinator_id = public.onevoice_current_coordinator_id()
      )
  )
);

create or replace function public.onevoice_search_literature(
  input_literature_id uuid default null,
  input_language text default null,
  input_state text default null,
  input_lga_city text default null,
  input_quantity integer default 1,
  input_latitude numeric default null,
  input_longitude numeric default null
)
returns table(inventory_id uuid, literature_id uuid, title text, author text, language text, available_quantity integer, source_type text, state text, lga_city text, general_location text, distance_km numeric)
language sql security definer set search_path = '' as $$
  select inventory.id, catalogue.id, catalogue.title, catalogue.author, inventory.language,
    inventory.on_hand_quantity - inventory.reserved_quantity as available_quantity,
    source.source_type, source.state, source.lga_city, source.general_location,
    case when input_latitude is not null and input_longitude is not null and source.latitude is not null and source.longitude is not null
      then round((6371 * acos(least(1, greatest(-1, cos(radians(input_latitude)) * cos(radians(source.latitude)) * cos(radians(source.longitude) - radians(input_longitude)) + sin(radians(input_latitude)) * sin(radians(source.latitude))))))::numeric, 1)
      else null end as distance_km
  from public.literature_inventory inventory
  join public.literature_sources source on source.id = inventory.source_id
  join public.literature_catalogue catalogue on catalogue.id = inventory.literature_id
  where (public.onevoice_current_evangelist_id() is not null or public.onevoice_current_coordinator_id() is not null)
    and source.is_active and inventory.is_available and catalogue.is_active
    and inventory.on_hand_quantity - inventory.reserved_quantity >= greatest(1, coalesce(input_quantity,1))
    and (input_literature_id is null or inventory.literature_id = input_literature_id)
    and (nullif(trim(input_language),'') is null or lower(inventory.language) = lower(trim(input_language)))
    and (nullif(trim(input_state),'') is null or lower(source.state) = lower(trim(input_state)))
    and (nullif(trim(input_lga_city),'') is null or lower(source.lga_city) = lower(trim(input_lga_city)))
  order by inventory.on_hand_quantity - inventory.reserved_quantity desc, distance_km nulls last, catalogue.title;
$$;

create or replace function public.onevoice_create_request(
  input_inventory_id uuid,
  input_quantity integer,
  input_prospect_state text,
  input_prospect_lga_city text,
  input_prospect_general_location text,
  input_delivery_method text,
  input_note text default null,
  input_dbs_student_id uuid default null
)
returns public.literature_requests
language plpgsql security definer set search_path = '' as $$
declare
  evangelist_record public.literature_evangelists;
  coordinator_record public.literature_coordinators;
  inventory_record public.literature_inventory;
  source_record public.literature_sources;
  request_record public.literature_requests;
  threshold integer := 20;
  is_bulk boolean;
begin
  select * into evangelist_record from public.literature_evangelists where profile_id = auth.uid() and account_status = 'active';
  select * into coordinator_record from public.literature_coordinators where profile_id = auth.uid() and account_status = 'active';
  if evangelist_record.id is null and coordinator_record.id is null then
    raise exception 'Only approved OneVoice27 evangelists and coordinators can request literature';
  end if;
  if input_quantity is null or input_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;
  if nullif(trim(input_prospect_state),'') is null or nullif(trim(input_prospect_lga_city),'') is null then raise exception 'Prospect state and LGA/city are required'; end if;
  if input_delivery_method not in ('evangelist_collection','donor_delivery','church_volunteer_delivery','approved_courier','other_approved') then raise exception 'Choose a valid delivery method'; end if;
  select * into inventory_record from public.literature_inventory where id = input_inventory_id for update;
  if not found or not inventory_record.is_available then raise exception 'Selected inventory is unavailable'; end if;
  select * into source_record from public.literature_sources where id = inventory_record.source_id and is_active;
  if not found then raise exception 'Literature source is unavailable'; end if;
  if inventory_record.on_hand_quantity - inventory_record.reserved_quantity < input_quantity then raise exception 'Insufficient available stock'; end if;
  select coalesce((setting_value #>> '{}')::integer,20) into threshold from public.onevoice_settings where setting_key='bulk_request_threshold';
  is_bulk := input_quantity > coalesce(threshold,20);
  insert into public.literature_requests(reference_number,evangelist_id,coordinator_id,source_id,inventory_id,literature_id,language,quantity,prospect_state,prospect_lga_city,prospect_general_location,delivery_method,evangelist_note,status,requires_approval,dbs_student_id)
  values(public.onevoice_request_reference(),evangelist_record.id,case when evangelist_record.id is null then coordinator_record.id else null end,source_record.id,inventory_record.id,inventory_record.literature_id,inventory_record.language,input_quantity,trim(input_prospect_state),trim(input_prospect_lga_city),nullif(trim(input_prospect_general_location),''),input_delivery_method,nullif(trim(input_note),''),case when is_bulk then 'submitted' else 'pending_donor_response' end,is_bulk,input_dbs_student_id)
  returning * into request_record;
  if not is_bulk then
    update public.literature_inventory set reserved_quantity = reserved_quantity + input_quantity where id = inventory_record.id;
    insert into public.literature_inventory_transactions(inventory_id,request_id,event_type,reserved_change,reason,actor_profile_id) values(inventory_record.id,request_record.id,'reservation',input_quantity,'Request reservation',auth.uid());
  end if;
  insert into public.literature_request_status_history(request_id,new_status,note,actor_profile_id) values(request_record.id,request_record.status,'Literature request submitted',auth.uid());
  perform public.onevoice_audit('request_created','literature_request',request_record.id,jsonb_build_object('reference',request_record.reference_number,'quantity',input_quantity));
  if source_record.profile_id is not null then perform public.enqueue_automated_email('onevoice_request_submitted',source_record.profile_id,request_record.id::text,request_record.updated_at::text,jsonb_build_object('request_reference',request_record.reference_number,'literature_title',(select title from public.literature_catalogue where id=request_record.literature_id),'quantity',input_quantity,'dashboard_link','/literature')); end if;
  return request_record;
end;
$$;

create or replace function public.onevoice_set_coordinator_status(input_coordinator_id uuid, input_status text)
returns public.literature_coordinators
language plpgsql security definer set search_path = '' as $$
declare coordinator_record public.literature_coordinators;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if input_status not in ('active','suspended','disabled') then raise exception 'Choose a valid coordinator status'; end if;
  update public.literature_coordinators
  set account_status = input_status,
      approved_by = case when input_status = 'active' then auth.uid() else approved_by end,
      approved_at = case when input_status = 'active' then now() else approved_at end
  where id = input_coordinator_id
  returning * into coordinator_record;
  if not found then raise exception 'Coordinator application not found'; end if;
  return coordinator_record;
end;
$$;

create or replace function public.onevoice_transition_request(input_request_id uuid, input_new_status text, input_note text default null)
returns public.literature_requests
language plpgsql security definer set search_path = '' as $$
declare
  request_record public.literature_requests;
  source_record public.literature_sources;
  previous_status text;
  is_owner boolean;
  is_requester boolean;
  permitted boolean := false;
  release_reservation boolean := false;
  complete_distribution boolean := false;
begin
  select * into request_record from public.literature_requests where id=input_request_id for update;
  if not found then raise exception 'Literature request not found'; end if;
  select * into source_record from public.literature_sources where id=request_record.source_id;
  is_owner := source_record.profile_id = auth.uid();
  is_requester := request_record.evangelist_id = public.onevoice_current_evangelist_id()
    or request_record.coordinator_id = public.onevoice_current_coordinator_id();
  if public.is_admin() then permitted := true;
  elsif input_new_status in ('accepted','ready_for_collection_delivery','in_transit','declined') and is_owner then permitted := true;
  elsif input_new_status in ('cancelled','delivered') and is_requester then permitted := true; end if;
  if not permitted then raise exception 'You are not permitted to make this request change'; end if;
  if input_new_status = 'accepted' and request_record.status = 'pending_donor_response' then null;
  elsif input_new_status = 'ready_for_collection_delivery' and request_record.status in ('accepted','reserved') then null;
  elsif input_new_status = 'in_transit' and request_record.status = 'ready_for_collection_delivery' then null;
  elsif input_new_status = 'delivered' and request_record.status in ('ready_for_collection_delivery','in_transit') then complete_distribution := true;
  elsif input_new_status in ('declined','cancelled') and request_record.status in ('submitted','pending_donor_response','accepted','reserved','ready_for_collection_delivery') then release_reservation := request_record.status <> 'submitted';
  else raise exception 'Invalid request status transition'; end if;
  previous_status := request_record.status;
  update public.literature_requests set status=input_new_status,accepted_at=case when input_new_status='accepted' then now() else accepted_at end,completed_at=case when complete_distribution then now() else completed_at end where id=request_record.id returning * into request_record;
  insert into public.literature_request_status_history(request_id,previous_status,new_status,note,actor_profile_id) values(request_record.id,previous_status,request_record.status,nullif(trim(input_note),''),auth.uid());
  if release_reservation then update public.literature_inventory set reserved_quantity = reserved_quantity - request_record.quantity where id=request_record.inventory_id; insert into public.literature_inventory_transactions(inventory_id,request_id,event_type,reserved_change,reason,actor_profile_id) values(request_record.inventory_id,request_record.id,'reservation_released',-request_record.quantity,request_record.status,auth.uid()); end if;
  if complete_distribution then
    update public.literature_inventory set reserved_quantity=reserved_quantity-request_record.quantity,on_hand_quantity=on_hand_quantity-request_record.quantity,distributed_quantity=distributed_quantity+request_record.quantity where id=request_record.inventory_id;
    insert into public.literature_inventory_transactions(inventory_id,request_id,event_type,quantity_change,reserved_change,distributed_change,reason,actor_profile_id) values(request_record.inventory_id,request_record.id,'distribution_completed',-request_record.quantity,-request_record.quantity,request_record.quantity,'Delivery confirmed',auth.uid());
    insert into public.literature_distribution_confirmations(request_id,confirmed_by,note) values(request_record.id,auth.uid(),nullif(trim(input_note),'')) on conflict(request_id) do nothing;
    update public.literature_requests set status='completed',completed_at=now() where id=request_record.id returning * into request_record;
    insert into public.literature_request_status_history(request_id,previous_status,new_status,note,actor_profile_id) values(request_record.id,'delivered','completed','Distribution completed',auth.uid());
  end if;
  perform public.onevoice_audit('request_status_changed','literature_request',request_record.id,jsonb_build_object('status',request_record.status));
  return request_record;
end;
$$;

revoke all on function public.onevoice_current_coordinator_id() from public;
revoke all on function public.onevoice_register_coordinator_from_auth_user() from public;
revoke all on function public.onevoice_set_coordinator_status(uuid,text) from public;
grant execute on function public.onevoice_current_coordinator_id() to authenticated;
grant execute on function public.onevoice_set_coordinator_status(uuid,text) to authenticated;
