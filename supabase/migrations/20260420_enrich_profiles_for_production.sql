create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  plan text default 'free',
  subscription_status text,
  is_premium boolean not null default false,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  stripe_customer_id text,
  locale text,
  onboarding_completed boolean not null default false
);

alter table public.profiles
  add column if not exists id uuid,
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists plan text default 'free',
  add column if not exists subscription_status text,
  add column if not exists is_premium boolean not null default false,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists locale text,
  add column if not exists onboarding_completed boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'user_id'
  ) then
    execute '
      update public.profiles
      set id = coalesce(id, user_id)
      where id is null
        and user_id is not null
    ';
  end if;
end
$$;

update public.profiles p
set
  email = coalesce(p.email, u.email),
  full_name = coalesce(
    p.full_name,
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'first_name'
  )
from auth.users u
where u.id = p.id;

create unique index if not exists profiles_id_unique_idx
  on public.profiles(id);

create unique index if not exists profiles_email_unique_idx
  on public.profiles(email)
  where email is not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);
