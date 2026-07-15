begin;

alter table public.profiles
  add column if not exists welcome_letter_first_login_at timestamptz;

create or replace function public.student_mark_welcome_letter_first_login()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_login_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set welcome_letter_first_login_at = coalesce(
    welcome_letter_first_login_at,
    now()
  )
  where id = auth.uid()
    and role = 'student'
  returning welcome_letter_first_login_at into first_login_at;

  if not found then
    raise exception 'Student account not found';
  end if;

  return first_login_at;
end;
$$;

revoke all on function public.student_mark_welcome_letter_first_login() from public;
grant execute on function public.student_mark_welcome_letter_first_login() to authenticated;

notify pgrst, 'reload schema';

commit;
