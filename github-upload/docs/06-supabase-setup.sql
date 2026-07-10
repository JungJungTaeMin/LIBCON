create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "service role manages app_state" on public.app_state;
create policy "service role manages app_state"
on public.app_state
for all
to service_role
using (true)
with check (true);

insert into public.app_state (id, data)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;
