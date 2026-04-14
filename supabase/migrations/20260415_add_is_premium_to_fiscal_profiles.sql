alter table public.fiscal_profiles
  add column if not exists is_premium boolean not null default false;

update public.fiscal_profiles
set is_premium = true
where plan in ('beta_founder', 'essential', 'pilotage', 'fiscal_ai', 'finance_pro');

comment on column public.fiscal_profiles.is_premium
  is 'Persistent premium access flag used to restore paid or founder access after login.';
