-- Passwords are never collected in public registration forms. Supabase Auth
-- sends each account a time-limited invitation link for password setup instead.
update public.registration_forms
set fields = coalesce(
  (
    select jsonb_agg(value)
    from jsonb_array_elements(fields) value
    where value->>'key' <> 'password'
      and value->>'type' <> 'password'
  ),
  '[]'::jsonb
),
updated_at = now()
where recruitment_kind in ('student', 'volunteer_instructor')
  and exists (
    select 1
    from jsonb_array_elements(fields) value
    where value->>'key' = 'password' or value->>'type' = 'password'
  );
