alter table public.fiscal_profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

update public.fiscal_profiles
set trial_ends_at = trial_started_at + interval '90 days'
where trial_started_at is not null
  and trial_ends_at is null;

alter table public.fiscal_profiles
  drop constraint if exists fiscal_profiles_trial_window_check;

alter table public.fiscal_profiles
  add constraint fiscal_profiles_trial_window_check
  check (
    trial_started_at is null
    or trial_ends_at is null
    or trial_ends_at >= trial_started_at
  );

comment on column public.fiscal_profiles.trial_started_at
  is 'Timestamp when the founder beta trial started for this fiscal workspace.';

comment on column public.fiscal_profiles.trial_ends_at
  is 'Timestamp when the founder beta trial ends for this fiscal workspace.';
