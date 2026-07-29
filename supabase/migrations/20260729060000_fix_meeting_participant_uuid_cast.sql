begin;

create or replace function public.communication_schedule_meeting(
  input_title text,
  input_description text,
  input_scheduled_start timestamptz,
  input_scheduled_end timestamptz,
  input_call_type text,
  input_meeting_room text,
  input_participant_ids jsonb
)
returns public.meeting_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_meeting public.meeting_schedules;
  participant_id uuid;
begin
  if auth.uid() is null
    or input_call_type not in ('audio', 'video')
    or input_meeting_room !~ '^dbs-[0-9a-f]{32}$'
    or input_scheduled_start <= now()
    or input_scheduled_end <= input_scheduled_start then
    raise exception 'Invalid meeting details';
  end if;

  if jsonb_typeof(input_participant_ids) <> 'array'
    or jsonb_array_length(input_participant_ids) = 0 then
    raise exception 'Select at least one eligible participant';
  end if;

  for participant_id in
    select value::uuid
    from jsonb_array_elements_text(input_participant_ids) as participant(value)
  loop
    if not public.communication_can_contact(auth.uid(), participant_id) then
      raise exception 'One or more selected participants are not eligible';
    end if;
  end loop;

  insert into public.meeting_schedules(
    title, description, created_by, scheduled_start, scheduled_end, call_type, meeting_room
  )
  values (
    trim(input_title),
    nullif(trim(input_description), ''),
    auth.uid(),
    input_scheduled_start,
    input_scheduled_end,
    input_call_type,
    input_meeting_room
  )
  returning * into created_meeting;

  insert into public.meeting_participants(meeting_id, user_id)
  select created_meeting.id, value::uuid
  from jsonb_array_elements_text(input_participant_ids) as participant(value);

  return created_meeting;
end;
$$;

commit;
