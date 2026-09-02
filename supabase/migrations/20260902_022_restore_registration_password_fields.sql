-- Registration passwords are handled by Supabase Auth and are never kept in
-- registration form data. Keep the password immediately after Username and
-- leave the required privacy consent as the final public-form field.
update public.registration_forms
set fields =
  jsonb_build_array(
    coalesce(
      (
        select value || '{"required":true,"system":true,"type":"text","label":"Full name"}'::jsonb
        from jsonb_array_elements(fields) value
        where value->>'key' = 'full_name'
        limit 1
      ),
      '{"key":"full_name","label":"Full name","type":"text","required":true,"system":true}'::jsonb
    ),
    coalesce(
      (
        select value || '{"required":true,"system":true,"type":"email","label":"Email address"}'::jsonb
        from jsonb_array_elements(fields) value
        where value->>'key' = 'email'
        limit 1
      ),
      '{"key":"email","label":"Email address","type":"email","required":true,"system":true}'::jsonb
    ),
    coalesce(
      (
        select value || '{"required":true,"system":true,"type":"text","label":"Username"}'::jsonb
        from jsonb_array_elements(fields) value
        where value->>'key' = 'username'
        limit 1
      ),
      '{"key":"username","label":"Username","type":"text","required":true,"system":true}'::jsonb
    ),
    '{"key":"password","label":"Password","type":"password","required":true,"system":true}'::jsonb
  ) || coalesce(
    (
      select jsonb_agg(value order by ordinality)
      from jsonb_array_elements(fields) with ordinality as field(value, ordinality)
      where value->>'key' not in ('full_name', 'email', 'username', 'password', 'privacy_consent')
    ),
    '[]'::jsonb
  ) || jsonb_build_array(
    coalesce(
      (
        select value || jsonb_build_object(
          'label', 'I consent to DBS Kaduna using my details for registration, course administration, and instructor support in line with the Privacy Notice.',
          'type', 'checkbox',
          'required', true,
          'system', true
        )
        from jsonb_array_elements(fields) value
        where value->>'key' = 'privacy_consent'
        limit 1
      ),
      '{"key":"privacy_consent","label":"I consent to DBS Kaduna using my details for registration, course administration, and instructor support in line with the Privacy Notice.","type":"checkbox","required":true,"system":true}'::jsonb
    )
  )
where recruitment_kind in ('student', 'volunteer_instructor');

notify pgrst, 'reload schema';
