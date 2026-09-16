-- Rename the dedicated Adventist Literature Network administrator in persisted records.
-- The guard keeps this migration safe to rerun and avoids overwriting a later custom name.

update public.literature_coordinators coordinator
set name = 'Literature Network Administrator'
from public.profiles profile
where coordinator.profile_id = profile.id
  and lower(coalesce(coordinator.email, profile.email, '')) = 'onevoice27-admin@dbskaduna.org'
  and coordinator.name = 'OneVoice27 Administrator';

update public.profiles
set full_name = 'Literature Network Administrator'
where lower(coalesce(email, '')) = 'onevoice27-admin@dbskaduna.org'
  and full_name = 'OneVoice27 Administrator';
