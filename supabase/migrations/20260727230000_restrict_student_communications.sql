begin;

-- Students may communicate only with their active, assigned instructor.
-- Administration remains connected to volunteer instructors; neither side may
-- contact students through this communication hub.
create or replace function public.communication_can_contact(actor_id uuid, target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select actor_id is not null and target_id is not null and actor_id <> target_id and (
    exists (
      select 1
      from public.students student
      join public.instructors instructor on instructor.id = student.instructor_id
      where student.profile_id = actor_id
        and instructor.profile_id = target_id
        and student.status = 'active'
        and instructor.status = 'active'
    )
    or exists (
      select 1
      from public.instructors instructor
      join public.students student on student.instructor_id = instructor.id
      where instructor.profile_id = actor_id
        and student.profile_id = target_id
        and instructor.status = 'active'
        and student.status = 'active'
    )
    or exists (
      select 1
      from public.profiles actor
      join public.profiles target on target.id = target_id
      where actor.id = actor_id
        and actor.role = 'admin'
        and actor.status = 'active'
        and target.role = 'instructor'
        and target.status = 'active'
    )
    or exists (
      select 1
      from public.profiles actor
      join public.profiles target on target.id = target_id
      where actor.id = actor_id
        and actor.role = 'instructor'
        and actor.status = 'active'
        and target.role = 'admin'
        and target.status = 'active'
    )
  );
$$;

-- Calls that were created before this access rule must not remain actionable.
update public.calls call_record
set
  status = 'cancelled',
  ended_at = coalesce(call_record.ended_at, now()),
  updated_at = now()
where call_record.status in ('calling', 'ringing', 'accepted')
  and (
    (
      exists (
        select 1 from public.profiles caller_profile
        where caller_profile.id = call_record.caller_id
          and caller_profile.role = 'student'
      )
      and exists (
        select 1 from public.profiles recipient_profile
        where recipient_profile.id = call_record.recipient_id
          and recipient_profile.role = 'admin'
      )
    )
    or (
      exists (
        select 1 from public.profiles caller_profile
        where caller_profile.id = call_record.caller_id
          and caller_profile.role = 'admin'
      )
      and exists (
        select 1 from public.profiles recipient_profile
        where recipient_profile.id = call_record.recipient_id
          and recipient_profile.role = 'student'
      )
    )
  );

commit;
