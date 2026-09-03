-- Older forms can contain a second field labelled Password under a different
-- key. Keep the protected `password` field and remove that legacy duplicate.
update public.registration_forms
set fields = (
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(fields) with ordinality as field(value, ordinality)
  where not (
    lower(trim(coalesce(value->>'label', ''))) = 'password'
    and lower(coalesce(value->>'key', '')) <> 'password'
  )
)
where recruitment_kind in ('student', 'volunteer_instructor')
  and exists (
    select 1
    from jsonb_array_elements(fields) value
    where lower(trim(coalesce(value->>'label', ''))) = 'password'
      and lower(coalesce(value->>'key', '')) <> 'password'
  );

notify pgrst, 'reload schema';
