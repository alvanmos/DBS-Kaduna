-- Give the dedicated OneVoice27 administrator full literature access without a DBS admin role.
create or replace function public.onevoice_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and lower(email) = 'onevoice27-admin@dbskaduna.org'
      and status = 'active'
  );
$$;

revoke all on function public.onevoice_is_admin() from public;
grant execute on function public.onevoice_is_admin() to anon, authenticated;

drop policy if exists literature_catalogue_read on public.literature_catalogue;
create policy literature_catalogue_read on public.literature_catalogue
  for select using (is_active or public.onevoice_is_admin());
drop policy if exists literature_catalogue_admin on public.literature_catalogue;
create policy literature_catalogue_admin on public.literature_catalogue
  for all to authenticated using (public.onevoice_is_admin()) with check (public.onevoice_is_admin());

drop policy if exists literature_sources_owner_or_admin on public.literature_sources;
create policy literature_sources_owner_or_admin on public.literature_sources
  for all to authenticated using (profile_id = auth.uid() or public.onevoice_is_admin()) with check (profile_id = auth.uid() or public.onevoice_is_admin());

drop policy if exists literature_evangelists_self_or_admin on public.literature_evangelists;
create policy literature_evangelists_self_or_admin on public.literature_evangelists
  for select to authenticated using (profile_id = auth.uid() or public.onevoice_is_admin());
drop policy if exists literature_evangelists_admin_write on public.literature_evangelists;
create policy literature_evangelists_admin_write on public.literature_evangelists
  for all to authenticated using (public.onevoice_is_admin()) with check (public.onevoice_is_admin());

drop policy if exists literature_coordinators_self_or_admin on public.literature_coordinators;
create policy literature_coordinators_self_or_admin on public.literature_coordinators
  for select to authenticated using (profile_id = auth.uid() or public.onevoice_is_admin());
drop policy if exists literature_coordinators_admin_write on public.literature_coordinators;
create policy literature_coordinators_admin_write on public.literature_coordinators
  for all to authenticated using (public.onevoice_is_admin()) with check (public.onevoice_is_admin());

drop policy if exists literature_inventory_owner_or_admin on public.literature_inventory;
create policy literature_inventory_owner_or_admin on public.literature_inventory
  for all to authenticated
  using (public.onevoice_is_admin() or exists (select 1 from public.literature_sources source where source.id = source_id and source.profile_id = auth.uid()))
  with check (public.onevoice_is_admin() or exists (select 1 from public.literature_sources source where source.id = source_id and source.profile_id = auth.uid()));

drop policy if exists literature_requests_participant_or_admin on public.literature_requests;
create policy literature_requests_participant_or_admin on public.literature_requests
  for select to authenticated using (
    public.onevoice_is_admin()
    or evangelist_id = public.onevoice_current_evangelist_id()
    or coordinator_id = public.onevoice_current_coordinator_id()
    or exists (select 1 from public.literature_sources source where source.id = source_id and source.profile_id = auth.uid())
  );

drop policy if exists literature_history_participant_or_admin on public.literature_request_status_history;
create policy literature_history_participant_or_admin on public.literature_request_status_history
  for select to authenticated using (
    public.onevoice_is_admin()
    or exists (
      select 1 from public.literature_requests request
      where request.id = request_id and (
        request.evangelist_id = public.onevoice_current_evangelist_id()
        or request.coordinator_id = public.onevoice_current_coordinator_id()
        or exists (select 1 from public.literature_sources source where source.id = request.source_id and source.profile_id = auth.uid())
      )
    )
  );

drop policy if exists literature_confirmations_participant_or_admin on public.literature_distribution_confirmations;
create policy literature_confirmations_participant_or_admin on public.literature_distribution_confirmations
  for select to authenticated using (
    public.onevoice_is_admin()
    or exists (
      select 1 from public.literature_requests request
      where request.id = request_id and (
        request.evangelist_id = public.onevoice_current_evangelist_id()
        or request.coordinator_id = public.onevoice_current_coordinator_id()
      )
    )
  );

drop policy if exists literature_reports_owner_or_admin on public.literature_problem_reports;
create policy literature_reports_owner_or_admin on public.literature_problem_reports
  for all to authenticated
  using (reporter_profile_id = auth.uid() or public.onevoice_is_admin() or public.onevoice_is_coordinator())
  with check (reporter_profile_id = auth.uid() or public.onevoice_is_admin());

drop policy if exists literature_audit_admin_only on public.literature_audit_logs;
create policy literature_audit_admin_only on public.literature_audit_logs
  for select to authenticated using (public.onevoice_is_admin());
drop policy if exists onevoice_settings_admin_only on public.onevoice_settings;
create policy onevoice_settings_admin_only on public.onevoice_settings
  for all to authenticated using (public.onevoice_is_admin()) with check (public.onevoice_is_admin());

drop policy if exists donation_offers_admin_read on public.literature_donation_offers;
create policy donation_offers_admin_read on public.literature_donation_offers
  for select to authenticated using (public.onevoice_is_admin());
drop policy if exists donation_offers_admin_update on public.literature_donation_offers;
create policy donation_offers_admin_update on public.literature_donation_offers
  for update to authenticated using (public.onevoice_is_admin()) with check (public.onevoice_is_admin());

create or replace function public.onevoice_set_coordinator_status(input_coordinator_id uuid, input_status text)
returns public.literature_coordinators
language plpgsql security definer set search_path = '' as $$
declare coordinator_record public.literature_coordinators;
begin
  if not public.onevoice_is_admin() then raise exception 'Administrator access required'; end if;
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
