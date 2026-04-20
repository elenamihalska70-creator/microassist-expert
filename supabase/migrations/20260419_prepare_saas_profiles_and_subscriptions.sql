create extension if not exists pgcrypto;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text default 'free',
  subscription_status text,
  is_premium boolean not null default false,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists plan text default 'free',
  add column if not exists subscription_status text,
  add column if not exists is_premium boolean not null default false,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions(user_id);

create unique index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.fiscal_profiles
  add column if not exists country_code text,
  add column if not exists currency_code text;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by user_id
      order by coalesce(updated_at, created_at, now()) desc, ctid desc
    ) as row_num
  from public.fiscal_profiles
  where user_id is not null
)
delete from public.fiscal_profiles fp
using ranked
where fp.ctid = ranked.ctid
  and ranked.row_num > 1;

create unique index if not exists fiscal_profiles_user_id_unique_idx
  on public.fiscal_profiles(user_id);

do $$
declare
  has_plan boolean;
  has_subscription_status boolean;
  has_is_premium boolean;
  has_trial_started_at boolean;
  has_trial_ends_at boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fiscal_profiles'
      and column_name = 'plan'
  ) into has_plan;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fiscal_profiles'
      and column_name = 'subscription_status'
  ) into has_subscription_status;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fiscal_profiles'
      and column_name = 'is_premium'
  ) into has_is_premium;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fiscal_profiles'
      and column_name = 'trial_started_at'
  ) into has_trial_started_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fiscal_profiles'
      and column_name = 'trial_ends_at'
  ) into has_trial_ends_at;

  execute format($sql$
    insert into public.profiles (
      user_id,
      plan,
      subscription_status,
      is_premium,
      trial_started_at,
      trial_ends_at,
      created_at,
      updated_at
    )
    select
      fp.user_id,
      %s,
      %s,
      %s,
      %s,
      %s,
      coalesce(fp.created_at, now()),
      coalesce(fp.updated_at, now())
    from public.fiscal_profiles fp
    where fp.user_id is not null
    on conflict (user_id) do update
    set
      plan = excluded.plan,
      subscription_status = excluded.subscription_status,
      is_premium = excluded.is_premium,
      trial_started_at = excluded.trial_started_at,
      trial_ends_at = excluded.trial_ends_at,
      updated_at = now()
  $sql$,
    case
      when has_plan
        then 'case when fp.plan is null or fp.plan = '''' then ''free'' else fp.plan end'
      else '''free'''
    end,
    case
      when has_subscription_status
        then 'fp.subscription_status'
      else 'null'
    end,
    case
      when has_is_premium
        then 'coalesce(fp.is_premium, false)'
      else 'false'
    end,
    case
      when has_trial_started_at
        then 'fp.trial_started_at'
      else 'null'
    end,
    case
      when has_trial_ends_at
        then 'fp.trial_ends_at'
      else 'null'
    end
  );
end
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "subscriptions_insert_own" on public.subscriptions;
create policy "subscriptions_insert_own"
on public.subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists "subscriptions_update_own" on public.subscriptions;
create policy "subscriptions_update_own"
on public.subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
