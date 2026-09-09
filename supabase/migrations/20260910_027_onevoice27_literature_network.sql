-- OneVoice27 Literature Network: secure inventory, request workflow, and role model.
-- This module deliberately extends DBS profiles and keeps prospect information private.

alter type public.app_role add value if not exists 'donor';
alter type public.app_role add value if not exists 'evangelist';
alter type public.app_role add value if not exists 'coordinator';

create sequence if not exists public.onevoice_request_reference_sequence start with 1;

create table public.onevoice_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.onevoice_settings(setting_key, setting_value) values
  ('request_reference_region', '"KD"'::jsonb),
  ('bulk_request_threshold', '20'::jsonb)
on conflict (setting_key) do nothing;

create table public.literature_catalogue (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  short_description text not null default '',
  cover_image_path text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title, author)
);

create table public.literature_sources (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  source_type text not null check (source_type in ('individual','church','ministry','institution','organization')),
  display_name text not null,
  contact_name text,
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  whatsapp text,
  state text not null,
  lga_city text not null,
  general_location text,
  private_address text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  affiliation text,
  collection_information text,
  is_public_location boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.literature_evangelists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  whatsapp text,
  state_area text not null,
  affiliation text,
  account_status text not null default 'pending' check (account_status in ('pending','approved','active','suspended','disabled')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.literature_coordinators (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  state text not null,
  lga_city text,
  account_status text not null default 'active' check (account_status in ('active','suspended','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.literature_inventory (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.literature_sources(id) on delete restrict,
  literature_id uuid not null references public.literature_catalogue(id) on delete restrict,
  language text not null default 'English',
  total_supplied integer not null default 0 check (total_supplied >= 0),
  on_hand_quantity integer not null default 0 check (on_hand_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  distributed_quantity integer not null default 0 check (distributed_quantity >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint literature_inventory_available_check check (on_hand_quantity >= reserved_quantity),
  unique (source_id, literature_id, language)
);

create table public.literature_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.literature_inventory(id) on delete restrict,
  request_id uuid,
  event_type text not null check (event_type in ('initial_stock','stock_added','manual_adjustment','reservation','reservation_released','distribution_completed','stock_correction')),
  quantity_change integer not null default 0,
  reserved_change integer not null default 0,
  distributed_change integer not null default 0,
  reason text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.literature_requests (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  evangelist_id uuid not null references public.literature_evangelists(id) on delete restrict,
  source_id uuid not null references public.literature_sources(id) on delete restrict,
  inventory_id uuid not null references public.literature_inventory(id) on delete restrict,
  literature_id uuid not null references public.literature_catalogue(id) on delete restrict,
  language text not null,
  quantity integer not null check (quantity > 0),
  prospect_state text not null,
  prospect_lga_city text not null,
  prospect_general_location text,
  delivery_method text not null check (delivery_method in ('evangelist_collection','donor_delivery','church_volunteer_delivery','approved_courier','other_approved')),
  evangelist_note text,
  status text not null default 'submitted' check (status in ('submitted','pending_donor_response','accepted','reserved','ready_for_collection_delivery','in_transit','delivered','completed','declined','cancelled')),
  requires_approval boolean not null default false,
  dbs_student_id uuid references public.students(id) on delete set null,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.literature_inventory_transactions
  add constraint literature_inventory_transactions_request_fk
  foreign key (request_id) references public.literature_requests(id) on delete set null;

create table public.literature_request_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.literature_requests(id) on delete cascade,
  previous_status text,
  new_status text not null,
  note text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.literature_distribution_confirmations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.literature_requests(id) on delete cascade,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  note text
);

create table public.literature_problem_reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.literature_requests(id) on delete set null,
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  details text not null check (char_length(trim(details)) between 10 and 4000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.literature_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index literature_catalogue_active_idx on public.literature_catalogue(is_active, title);
create unique index literature_catalogue_normalized_title_author_idx on public.literature_catalogue(lower(title), coalesce(author, ''));
create index literature_sources_location_idx on public.literature_sources(state, lga_city) where is_active;
create index literature_inventory_available_idx on public.literature_inventory(literature_id, language, source_id) where is_available;
create index literature_requests_status_idx on public.literature_requests(status, created_at desc);
create index literature_requests_evangelist_idx on public.literature_requests(evangelist_id, created_at desc);
create index literature_requests_source_idx on public.literature_requests(source_id, created_at desc);
create index literature_requests_reference_idx on public.literature_requests(reference_number);
create index literature_history_request_idx on public.literature_request_status_history(request_id, created_at desc);

create trigger literature_catalogue_updated_at before update on public.literature_catalogue for each row execute function public.set_updated_at();
create trigger literature_sources_updated_at before update on public.literature_sources for each row execute function public.set_updated_at();
create trigger literature_evangelists_updated_at before update on public.literature_evangelists for each row execute function public.set_updated_at();
create trigger literature_coordinators_updated_at before update on public.literature_coordinators for each row execute function public.set_updated_at();
create trigger literature_inventory_updated_at before update on public.literature_inventory for each row execute function public.set_updated_at();
create trigger literature_requests_updated_at before update on public.literature_requests for each row execute function public.set_updated_at();
create trigger literature_problem_reports_updated_at before update on public.literature_problem_reports for each row execute function public.set_updated_at();

create or replace function public.onevoice_current_evangelist_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.literature_evangelists
  where profile_id = auth.uid() and account_status = 'active'
  limit 1;
$$;

create or replace function public.onevoice_is_coordinator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.literature_coordinators where profile_id = auth.uid() and account_status = 'active');
$$;

create or replace function public.onevoice_request_reference()
returns text language plpgsql security definer set search_path = '' as $$
declare region_code text := 'KD';
begin
  select trim(both '"' from setting_value::text) into region_code
  from public.onevoice_settings where setting_key = 'request_reference_region';
  return format('OV27-%s-%s', upper(coalesce(nullif(region_code,''),'KD')), lpad(nextval('public.onevoice_request_reference_sequence')::text, 6, '0'));
end;
$$;

create or replace function public.onevoice_audit(input_action text, input_entity_type text, input_entity_id uuid, input_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.literature_audit_logs(actor_profile_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), input_action, input_entity_type, input_entity_id, coalesce(input_metadata, '{}'::jsonb));
$$;

alter table public.literature_catalogue enable row level security;
alter table public.literature_sources enable row level security;
alter table public.literature_evangelists enable row level security;
alter table public.literature_coordinators enable row level security;
alter table public.literature_inventory enable row level security;
alter table public.literature_inventory_transactions enable row level security;
alter table public.literature_requests enable row level security;
alter table public.literature_request_status_history enable row level security;
alter table public.literature_distribution_confirmations enable row level security;
alter table public.literature_problem_reports enable row level security;
alter table public.literature_audit_logs enable row level security;
alter table public.onevoice_settings enable row level security;

grant select on public.literature_catalogue to anon, authenticated;
grant select, insert, update, delete on public.literature_sources, public.literature_evangelists, public.literature_coordinators, public.literature_inventory, public.literature_inventory_transactions, public.literature_requests, public.literature_request_status_history, public.literature_distribution_confirmations, public.literature_problem_reports, public.literature_audit_logs, public.onevoice_settings to authenticated;

create policy literature_catalogue_read on public.literature_catalogue for select using (is_active or public.is_admin());
create policy literature_catalogue_admin on public.literature_catalogue for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy literature_sources_owner_or_admin on public.literature_sources for all to authenticated using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());
create policy literature_evangelists_self_or_admin on public.literature_evangelists for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy literature_evangelists_admin_write on public.literature_evangelists for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy literature_coordinators_self_or_admin on public.literature_coordinators for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy literature_coordinators_admin_write on public.literature_coordinators for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy literature_inventory_owner_or_admin on public.literature_inventory for all to authenticated using (public.is_admin() or exists (select 1 from public.literature_sources source where source.id = source_id and source.profile_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.literature_sources source where source.id = source_id and source.profile_id = auth.uid()));
create policy literature_requests_participant_or_admin on public.literature_requests for select to authenticated using (public.is_admin() or evangelist_id = public.onevoice_current_evangelist_id() or exists (select 1 from public.literature_sources source where source.id = source_id and source.profile_id = auth.uid()) or exists (select 1 from public.literature_coordinators coordinator where coordinator.profile_id = auth.uid() and coordinator.account_status = 'active' and coordinator.state = prospect_state and (coordinator.lga_city is null or coordinator.lga_city = prospect_lga_city)));
create policy literature_history_participant_or_admin on public.literature_request_status_history for select to authenticated using (public.is_admin() or exists (select 1 from public.literature_requests request where request.id = request_id and (request.evangelist_id = public.onevoice_current_evangelist_id() or exists (select 1 from public.literature_sources source where source.id = request.source_id and source.profile_id = auth.uid()))));
create policy literature_confirmations_participant_or_admin on public.literature_distribution_confirmations for select to authenticated using (public.is_admin() or exists (select 1 from public.literature_requests request where request.id = request_id and request.evangelist_id = public.onevoice_current_evangelist_id()));
create policy literature_reports_owner_or_admin on public.literature_problem_reports for all to authenticated using (reporter_profile_id = auth.uid() or public.is_admin() or public.onevoice_is_coordinator()) with check (reporter_profile_id = auth.uid() or public.is_admin());
create policy literature_audit_admin_only on public.literature_audit_logs for select to authenticated using (public.is_admin());
create policy onevoice_settings_admin_only on public.onevoice_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.onevoice_search_literature(input_literature_id uuid default null, input_language text default null, input_state text default null, input_lga_city text default null, input_quantity integer default 1, input_latitude numeric default null, input_longitude numeric default null)
returns table(inventory_id uuid, literature_id uuid, title text, author text, language text, available_quantity integer, source_type text, state text, lga_city text, general_location text, distance_km numeric)
language sql security definer set search_path = '' as $$
  select inventory.id, catalogue.id, catalogue.title, catalogue.author, inventory.language,
    inventory.on_hand_quantity - inventory.reserved_quantity, source.source_type, source.state, source.lga_city,
    source.general_location,
    case when input_latitude is not null and input_longitude is not null and source.latitude is not null and source.longitude is not null
      then round((6371 * acos(least(1, greatest(-1, cos(radians(input_latitude)) * cos(radians(source.latitude)) * cos(radians(source.longitude) - radians(input_longitude)) + sin(radians(input_latitude)) * sin(radians(source.latitude))))))::numeric, 1)
      else null end
  from public.literature_inventory inventory
  join public.literature_sources source on source.id = inventory.source_id
  join public.literature_catalogue catalogue on catalogue.id = inventory.literature_id
  where public.onevoice_current_evangelist_id() is not null
    and source.is_active and inventory.is_available and catalogue.is_active
    and inventory.on_hand_quantity - inventory.reserved_quantity >= greatest(1, coalesce(input_quantity,1))
    and (input_literature_id is null or inventory.literature_id = input_literature_id)
    and (nullif(trim(input_language),'') is null or lower(inventory.language) = lower(trim(input_language)))
    and (nullif(trim(input_state),'') is null or lower(source.state) = lower(trim(input_state)))
    and (nullif(trim(input_lga_city),'') is null or lower(source.lga_city) = lower(trim(input_lga_city)))
  order by available_quantity desc, distance_km nulls last, catalogue.title;
$$;

create or replace function public.onevoice_create_request(input_inventory_id uuid, input_quantity integer, input_prospect_state text, input_prospect_lga_city text, input_prospect_general_location text, input_delivery_method text, input_note text default null, input_dbs_student_id uuid default null)
returns public.literature_requests
language plpgsql security definer set search_path = '' as $$
declare evangelist_record public.literature_evangelists; inventory_record public.literature_inventory; source_record public.literature_sources; request_record public.literature_requests; threshold integer := 20; is_bulk boolean;
begin
  select * into evangelist_record from public.literature_evangelists where profile_id = auth.uid() and account_status = 'active';
  if not found then raise exception 'Only active, authorized evangelists can request literature'; end if;
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
  insert into public.literature_requests(reference_number,evangelist_id,source_id,inventory_id,literature_id,language,quantity,prospect_state,prospect_lga_city,prospect_general_location,delivery_method,evangelist_note,status,requires_approval,dbs_student_id)
  values(public.onevoice_request_reference(),evangelist_record.id,source_record.id,inventory_record.id,inventory_record.literature_id,inventory_record.language,input_quantity,trim(input_prospect_state),trim(input_prospect_lga_city),nullif(trim(input_prospect_general_location),''),input_delivery_method,nullif(trim(input_note),''),case when is_bulk then 'submitted' else 'pending_donor_response' end,is_bulk,input_dbs_student_id)
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

create or replace function public.onevoice_adjust_inventory(input_source_id uuid, input_literature_id uuid, input_language text, input_quantity_change integer, input_reason text)
returns public.literature_inventory
language plpgsql security definer set search_path = '' as $$
declare source_record public.literature_sources; inventory_record public.literature_inventory;
begin
  if input_quantity_change = 0 then raise exception 'Stock adjustment cannot be zero'; end if;
  if nullif(trim(input_language),'') is null or nullif(trim(input_reason),'') is null then raise exception 'Language and adjustment reason are required'; end if;
  select * into source_record from public.literature_sources where id=input_source_id;
  if not found or (not public.is_admin() and source_record.profile_id <> auth.uid()) then raise exception 'You are not permitted to adjust this inventory'; end if;
  if not exists (select 1 from public.literature_catalogue where id=input_literature_id and is_active) then raise exception 'Choose an active literature title'; end if;
  select * into inventory_record from public.literature_inventory where source_id=input_source_id and literature_id=input_literature_id and lower(language)=lower(trim(input_language)) for update;
  if not found then
    if input_quantity_change < 0 then raise exception 'Stock cannot become negative'; end if;
    insert into public.literature_inventory(source_id,literature_id,language,total_supplied,on_hand_quantity)
    values(input_source_id,input_literature_id,trim(input_language),input_quantity_change,input_quantity_change)
    returning * into inventory_record;
  else
    if inventory_record.on_hand_quantity + input_quantity_change < inventory_record.reserved_quantity then raise exception 'This adjustment would reduce stock below reserved quantity'; end if;
    update public.literature_inventory
    set on_hand_quantity=on_hand_quantity+input_quantity_change,
        total_supplied=case when input_quantity_change > 0 then total_supplied+input_quantity_change else total_supplied end
    where id=inventory_record.id returning * into inventory_record;
  end if;
  insert into public.literature_inventory_transactions(inventory_id,event_type,quantity_change,reason,actor_profile_id)
  values(inventory_record.id,case when input_quantity_change > 0 then 'stock_added' else 'manual_adjustment' end,input_quantity_change,trim(input_reason),auth.uid());
  perform public.onevoice_audit('inventory_adjusted','literature_inventory',inventory_record.id,jsonb_build_object('quantity_change',input_quantity_change,'reason',trim(input_reason)));
  return inventory_record;
end;
$$;

create or replace function public.onevoice_transition_request(input_request_id uuid, input_new_status text, input_note text default null)
returns public.literature_requests
language plpgsql security definer set search_path = '' as $$
declare request_record public.literature_requests; source_record public.literature_sources; previous_status text; is_owner boolean; is_evangelist boolean; permitted boolean := false; release_reservation boolean := false; complete_distribution boolean := false;
begin
  select * into request_record from public.literature_requests where id=input_request_id for update;
  if not found then raise exception 'Literature request not found'; end if;
  select * into source_record from public.literature_sources where id=request_record.source_id;
  is_owner := source_record.profile_id = auth.uid();
  is_evangelist := request_record.evangelist_id = public.onevoice_current_evangelist_id();
  if public.is_admin() then permitted := true;
  elsif input_new_status in ('accepted','ready_for_collection_delivery','in_transit','declined') and is_owner then permitted := true;
  elsif input_new_status in ('cancelled','delivered') and is_evangelist then permitted := true; end if;
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

create or replace function public.onevoice_queue_pending_request_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare request_record record; queued integer := 0;
begin
  for request_record in select request.id,request.reference_number,request.updated_at,source.profile_id,catalogue.title from public.literature_requests request join public.literature_sources source on source.id=request.source_id join public.literature_catalogue catalogue on catalogue.id=request.literature_id where request.status='pending_donor_response' and request.created_at <= now()-interval '7 days' and source.profile_id is not null loop
    if public.enqueue_automated_email('onevoice_request_pending_reminder',request_record.profile_id,request_record.id::text,to_char(now(),'IYYY-IW'),jsonb_build_object('request_reference',request_record.reference_number,'literature_title',request_record.title,'dashboard_link','/literature')) is not null then queued := queued + 1; end if;
  end loop;
  return queued;
end;
$$;

insert into public.automated_email_rules(rule_key,name,description,event_type,recipient_type,preference_category,subject_template,body_template) values
('onevoice_request_submitted','New literature request','Source receives a literature request','literature_request_submitted','literature_source','custom','New OneVoice27 request {{request_reference}}','A new request for {{literature_title}} ({{quantity}} copies) is awaiting your response.'),
('onevoice_request_pending_reminder','Literature request reminder','Source receives a seven-day pending reminder','literature_request_pending','literature_source','custom','Reminder: request {{request_reference}} awaits your response','Your OneVoice27 request for {{literature_title}} is still awaiting a response. Please sign in to review it.')
on conflict(rule_key) do nothing;

insert into public.literature_catalogue(title,author,short_description,metadata) values
('The Bible',null,'The Holy Bible for free distribution.','{"languages":["English","Hausa"]}'::jsonb),
('The Desire of Ages','Ellen G. White','A Christ-centred account of the life and ministry of Jesus.','{"languages":["English","Hausa"]}'::jsonb),
('Steps to Christ','Ellen G. White','A practical guide to a personal relationship with Jesus.','{"languages":["English","Hausa"]}'::jsonb),
('The Great Controversy','Ellen G. White','A study of the conflict between Christ and Satan through history.','{"languages":["English","Hausa"]}'::jsonb)
on conflict do nothing;

revoke all on function public.onevoice_current_evangelist_id() from public;
revoke all on function public.onevoice_is_coordinator() from public;
revoke all on function public.onevoice_request_reference() from public;
revoke all on function public.onevoice_audit(text,text,uuid,jsonb) from public;
revoke all on function public.onevoice_search_literature(uuid,text,text,text,integer,numeric,numeric) from public;
revoke all on function public.onevoice_create_request(uuid,integer,text,text,text,text,text,uuid) from public;
revoke all on function public.onevoice_adjust_inventory(uuid,uuid,text,integer,text) from public;
revoke all on function public.onevoice_transition_request(uuid,text,text) from public;
revoke all on function public.onevoice_queue_pending_request_reminders() from public;
grant execute on function public.onevoice_current_evangelist_id(), public.onevoice_is_coordinator(), public.onevoice_search_literature(uuid,text,text,text,integer,numeric,numeric), public.onevoice_create_request(uuid,integer,text,text,text,text,text,uuid), public.onevoice_transition_request(uuid,text,text) to authenticated;
grant execute on function public.onevoice_adjust_inventory(uuid,uuid,text,integer,text) to authenticated;
grant execute on function public.onevoice_queue_pending_request_reminders() to service_role;
