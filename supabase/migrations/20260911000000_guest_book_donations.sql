-- Guest offers are private submissions, not accounts or available inventory.
create table public.literature_donation_offers (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null check (char_length(donor_name) between 2 and 150),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  state text not null check (char_length(state) between 1 and 100),
  lga_city text not null check (char_length(lga_city) between 1 and 100),
  book_details text not null check (char_length(book_details) between 2 and 3000),
  quantity integer not null check (quantity between 1 and 1000000),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'received', 'closed')),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (nullif(trim(email), '') is not null or nullif(trim(phone), '') is not null)
);
alter table public.literature_donation_offers enable row level security;
revoke all on public.literature_donation_offers from anon, authenticated;
grant select, update on public.literature_donation_offers to authenticated;
grant all on public.literature_donation_offers to service_role;
create policy donation_offers_admin_read on public.literature_donation_offers
  for select to authenticated using (public.is_admin());
create policy donation_offers_admin_update on public.literature_donation_offers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create index donation_offers_created_at on public.literature_donation_offers(created_at desc);
