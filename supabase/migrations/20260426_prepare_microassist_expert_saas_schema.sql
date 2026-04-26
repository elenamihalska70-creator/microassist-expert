-- Future Microassist Expert SaaS backend layer.
-- This migration prepares the database model for cabinets, multi-user cabinet
-- membership, client portfolios, notes and client activity history.
-- The React UI intentionally continues to use localStorage for now; this schema
-- is the safe foundation for a later Supabase integration.

create extension if not exists pgcrypto;

create table if not exists public.cabinets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  structure_type text,
  max_clients integer,
  created_at timestamptz default now()
);

create table if not exists public.cabinet_members (
  id uuid primary key default gen_random_uuid(),
  cabinet_id uuid references public.cabinets(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'owner',
  created_at timestamptz default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  cabinet_id uuid references public.cabinets(id) on delete cascade,
  name text not null,
  activity text,
  revenue numeric default 0,
  periodicity text,
  last_declaration_date date,
  tva_status text,
  acre_status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  cabinet_id uuid references public.cabinets(id) on delete cascade,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.client_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  cabinet_id uuid references public.cabinets(id) on delete cascade,
  type text not null,
  label text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

comment on table public.cabinets is
  'Future SaaS cabinet workspace table for Microassist Expert. Not wired to the UI yet.';
comment on table public.cabinet_members is
  'Future SaaS membership table for cabinet-level access and multi-user support.';
comment on table public.clients is
  'Future SaaS client portfolio table. Current UI still persists clients in localStorage.';
comment on table public.client_notes is
  'Future SaaS normalized client notes table. Current UI still stores notes locally.';
comment on table public.client_history is
  'Future SaaS client activity log table. Current UI still stores history locally.';

create unique index if not exists cabinet_members_cabinet_user_unique_idx
  on public.cabinet_members(cabinet_id, user_id);

create index if not exists cabinet_members_user_id_idx
  on public.cabinet_members(user_id);

create index if not exists clients_cabinet_id_idx
  on public.clients(cabinet_id);

create index if not exists client_notes_client_id_idx
  on public.client_notes(client_id);

create index if not exists client_notes_cabinet_id_idx
  on public.client_notes(cabinet_id);

create index if not exists client_history_client_id_idx
  on public.client_history(client_id);

create index if not exists client_history_cabinet_id_idx
  on public.client_history(cabinet_id);

create or replace function public.is_cabinet_member(target_cabinet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cabinet_members cm
    where cm.cabinet_id = target_cabinet_id
      and cm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_cabinet_member(uuid) to authenticated;

alter table public.cabinets enable row level security;
alter table public.cabinet_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_notes enable row level security;
alter table public.client_history enable row level security;

drop policy if exists "cabinets_select_member" on public.cabinets;
create policy "cabinets_select_member"
on public.cabinets
for select
using (public.is_cabinet_member(id));

drop policy if exists "cabinets_insert_authenticated" on public.cabinets;
create policy "cabinets_insert_authenticated"
on public.cabinets
for insert
with check (auth.uid() is not null);

drop policy if exists "cabinets_update_member" on public.cabinets;
create policy "cabinets_update_member"
on public.cabinets
for update
using (public.is_cabinet_member(id))
with check (public.is_cabinet_member(id));

drop policy if exists "cabinets_delete_member" on public.cabinets;
create policy "cabinets_delete_member"
on public.cabinets
for delete
using (public.is_cabinet_member(id));

drop policy if exists "cabinet_members_select_member" on public.cabinet_members;
create policy "cabinet_members_select_member"
on public.cabinet_members
for select
using (public.is_cabinet_member(cabinet_id));

drop policy if exists "cabinet_members_insert_self_or_member" on public.cabinet_members;
create policy "cabinet_members_insert_self_or_member"
on public.cabinet_members
for insert
with check (
  auth.uid() is not null
  and (
    user_id = auth.uid()
    or public.is_cabinet_member(cabinet_id)
  )
);

drop policy if exists "cabinet_members_update_member" on public.cabinet_members;
create policy "cabinet_members_update_member"
on public.cabinet_members
for update
using (public.is_cabinet_member(cabinet_id))
with check (public.is_cabinet_member(cabinet_id));

drop policy if exists "cabinet_members_delete_member" on public.cabinet_members;
create policy "cabinet_members_delete_member"
on public.cabinet_members
for delete
using (public.is_cabinet_member(cabinet_id));

drop policy if exists "clients_select_cabinet_member" on public.clients;
create policy "clients_select_cabinet_member"
on public.clients
for select
using (public.is_cabinet_member(cabinet_id));

drop policy if exists "clients_insert_cabinet_member" on public.clients;
create policy "clients_insert_cabinet_member"
on public.clients
for insert
with check (public.is_cabinet_member(cabinet_id));

drop policy if exists "clients_update_cabinet_member" on public.clients;
create policy "clients_update_cabinet_member"
on public.clients
for update
using (public.is_cabinet_member(cabinet_id))
with check (public.is_cabinet_member(cabinet_id));

drop policy if exists "clients_delete_cabinet_member" on public.clients;
create policy "clients_delete_cabinet_member"
on public.clients
for delete
using (public.is_cabinet_member(cabinet_id));

drop policy if exists "client_notes_select_cabinet_member" on public.client_notes;
create policy "client_notes_select_cabinet_member"
on public.client_notes
for select
using (public.is_cabinet_member(cabinet_id));

drop policy if exists "client_notes_insert_cabinet_member" on public.client_notes;
create policy "client_notes_insert_cabinet_member"
on public.client_notes
for insert
with check (
  public.is_cabinet_member(cabinet_id)
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.cabinet_id = client_notes.cabinet_id
  )
);

drop policy if exists "client_notes_update_cabinet_member" on public.client_notes;
create policy "client_notes_update_cabinet_member"
on public.client_notes
for update
using (public.is_cabinet_member(cabinet_id))
with check (
  public.is_cabinet_member(cabinet_id)
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.cabinet_id = client_notes.cabinet_id
  )
);

drop policy if exists "client_notes_delete_cabinet_member" on public.client_notes;
create policy "client_notes_delete_cabinet_member"
on public.client_notes
for delete
using (public.is_cabinet_member(cabinet_id));

drop policy if exists "client_history_select_cabinet_member" on public.client_history;
create policy "client_history_select_cabinet_member"
on public.client_history
for select
using (public.is_cabinet_member(cabinet_id));

drop policy if exists "client_history_insert_cabinet_member" on public.client_history;
create policy "client_history_insert_cabinet_member"
on public.client_history
for insert
with check (
  public.is_cabinet_member(cabinet_id)
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.cabinet_id = client_history.cabinet_id
  )
);

drop policy if exists "client_history_update_cabinet_member" on public.client_history;
create policy "client_history_update_cabinet_member"
on public.client_history
for update
using (public.is_cabinet_member(cabinet_id))
with check (
  public.is_cabinet_member(cabinet_id)
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.cabinet_id = client_history.cabinet_id
  )
);

drop policy if exists "client_history_delete_cabinet_member" on public.client_history;
create policy "client_history_delete_cabinet_member"
on public.client_history
for delete
using (public.is_cabinet_member(cabinet_id));
