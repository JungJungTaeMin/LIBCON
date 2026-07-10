create table if not exists public.users (
  user_id bigint primary key,
  faction_id bigint,
  social_provider text,
  social_id text,
  email text,
  name text,
  nickname text,
  exp integer default 0,
  role text default 'USER',
  onboarding_completed boolean default false,
  picture text,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.factions (
  faction_id bigint primary key,
  faction_name text not null,
  faction_color text,
  join_type text default 'FREE',
  description text,
  created_by_user_id bigint,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.libraries (
  library_id bigint primary key,
  external_library_code text unique,
  library_name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  region text,
  phone text,
  homepage_url text,
  operating_hours text,
  closed_days text,
  current_occupied_faction_id bigint,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.library_influences (
  influence_id bigint primary key,
  library_id bigint not null,
  faction_id bigint not null,
  influence_score integer default 0,
  last_contributed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (library_id, faction_id)
);

create table if not exists public.books (
  book_id bigint primary key,
  isbn text unique,
  title text not null,
  author text,
  publisher text,
  cover_image_url text,
  total_pages integer default 0,
  description text,
  external_source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.reading_sessions (
  session_id bigint primary key,
  user_id bigint not null,
  faction_id bigint,
  library_id bigint,
  book_id bigint,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer,
  start_page integer,
  end_page integer,
  is_minimum_time_met boolean default false,
  is_location_valid boolean default false,
  status text,
  fail_reason text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.location_logs (
  location_log_id bigint primary key,
  session_id bigint not null,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  distance_from_library integer,
  is_out_of_range boolean default false,
  status text,
  checked_at timestamptz
);

create table if not exists public.ai_verifications (
  verification_id bigint primary key,
  session_id bigint not null,
  submitted_cover_image_url text,
  registered_cover_image_url text,
  review_text text,
  vision_confidence double precision,
  llm_confidence double precision,
  vision_passed boolean default false,
  llm_passed boolean default false,
  page_validation_passed boolean default false,
  location_validation_passed boolean default false,
  is_passed boolean default false,
  fail_reason text,
  model_name text,
  verified_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.influence_logs (
  log_id bigint primary key,
  user_id bigint,
  library_id bigint,
  faction_id bigint,
  session_id bigint,
  score_delta integer default 0,
  influence_before integer default 0,
  influence_after integer default 0,
  previous_occupied_faction_id bigint,
  new_occupied_faction_id bigint,
  is_occupation_changed boolean default false,
  action_type text,
  created_at timestamptz default now()
);

create table if not exists public.user_rankings (
  ranking_id bigint primary key,
  user_id bigint not null,
  faction_id bigint,
  rank integer,
  total_exp integer default 0,
  total_books integer default 0,
  total_sessions integer default 0,
  updated_at timestamptz default now()
);

create table if not exists public.faction_rankings (
  ranking_id bigint primary key,
  faction_id bigint not null,
  rank integer,
  total_influence integer default 0,
  occupied_library_count integer default 0,
  member_count integer default 0,
  updated_at timestamptz default now()
);

alter table public.users enable row level security;
alter table public.factions enable row level security;
alter table public.libraries enable row level security;
alter table public.library_influences enable row level security;
alter table public.books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.location_logs enable row level security;
alter table public.ai_verifications enable row level security;
alter table public.influence_logs enable row level security;
alter table public.user_rankings enable row level security;
alter table public.faction_rankings enable row level security;

drop policy if exists "service role users access" on public.users;
drop policy if exists "service role factions access" on public.factions;
drop policy if exists "service role libraries access" on public.libraries;
drop policy if exists "service role library influences access" on public.library_influences;
drop policy if exists "service role books access" on public.books;
drop policy if exists "service role reading sessions access" on public.reading_sessions;
drop policy if exists "service role location logs access" on public.location_logs;
drop policy if exists "service role ai verifications access" on public.ai_verifications;
drop policy if exists "service role influence logs access" on public.influence_logs;
drop policy if exists "service role user rankings access" on public.user_rankings;
drop policy if exists "service role faction rankings access" on public.faction_rankings;

create policy "service role users access" on public.users for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role factions access" on public.factions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role libraries access" on public.libraries for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role library influences access" on public.library_influences for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role books access" on public.books for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role reading sessions access" on public.reading_sessions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role location logs access" on public.location_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role ai verifications access" on public.ai_verifications for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role influence logs access" on public.influence_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role user rankings access" on public.user_rankings for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role faction rankings access" on public.faction_rankings for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
