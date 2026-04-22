create extension if not exists pgcrypto;

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  email text not null,
  event_type text not null,
  sent_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists email_events_user_id_idx
  on public.email_events(user_id);

create index if not exists email_events_event_type_idx
  on public.email_events(event_type);

create unique index if not exists email_events_email_event_type_unique_idx
  on public.email_events(lower(email), event_type);
