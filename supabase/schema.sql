-- Beat The Board — Supabase schema
--
-- Run this whole file once in the Supabase SQL Editor (Database -> SQL Editor -> New query).
-- Safe to re-run: every statement below is "create if not exists" / "or replace".

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists trip_settings (
  id smallint primary key default 1,
  trip_name text not null default 'Centre Parcs Trip',
  constraint trip_settings_singleton check (id = 1)
);
insert into trip_settings (id, trip_name)
  values (1, 'Centre Parcs Trip')
  on conflict (id) do nothing;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text default '',
  created_at timestamptz not null default now()
);

-- Real accounts: each player row can be linked to one auth.users account.
-- Nullable, because a fresh install of this file predates player accounts —
-- and because a player row could in principle exist before anyone claims
-- it. icon_id is one of a small fixed set of profile icons the player
-- picks after their first sign-in (see public/icons/ — Sam swaps these
-- files for real illustrated art later without touching any code).
alter table players add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table players add column if not exists icon_id text;
create unique index if not exists players_user_id_key on players (user_id);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  note text default '',
  ranking uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- The single table of who is allowed to edit the board. There should only
-- ever be one row in here — see the /admin/setup bootstrap flow, which is
-- the only thing allowed to insert into this table, and only while it's
-- still empty.
create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table trip_settings enable row level security;
alter table players enable row level security;
alter table events enable row level security;
alter table admins enable row level security;

-- Anyone (including anonymous visitors following the shared link) can read
-- the board.
drop policy if exists "trip_settings read for everyone" on trip_settings;
create policy "trip_settings read for everyone" on trip_settings
  for select using (true);

drop policy if exists "players read for everyone" on players;
create policy "players read for everyone" on players
  for select using (true);

drop policy if exists "events read for everyone" on events;
create policy "events read for everyone" on events
  for select using (true);

-- Only a signed-in admin (present in the admins table) can write.
drop policy if exists "trip_settings write for admins" on trip_settings;
create policy "trip_settings write for admins" on trip_settings
  for update using (auth.uid() in (select user_id from admins));

drop policy if exists "players write for admins" on players;
create policy "players write for admins" on players
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- A player can update their OWN row (to set their name/icon) once their
-- account is linked to it — but not anyone else's. In practice the app
-- only ever sends name/icon_id changes from this path, but note this
-- policy technically allows a player to edit any column on their own row;
-- fine for a small trusted family app, worth knowing if you extend it.
drop policy if exists "players can update own profile" on players;
create policy "players can update own profile" on players
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "events write for admins" on events;
create policy "events write for admins" on events
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- admins: a signed-in user can only ever read THEIR OWN row (so the app can
-- ask "am I the admin?" without being able to list who else is) — the
-- policies on trip_settings/players/events above do the real enforcement
-- server-side regardless of what the client believes. The ONE-TIME
-- bootstrap insert is allowed for any signed-in user for as long as the
-- table is still empty; once the first row exists, this policy blocks
-- every further insert, so only one admin can ever bootstrap itself this
-- way.
drop policy if exists "admins can read own row" on admins;
create policy "admins can read own row" on admins
  for select using (auth.uid() = user_id);

drop policy if exists "admins bootstrap while empty" on admins;
create policy "admins bootstrap while empty" on admins
  for insert with check (
    auth.uid() = user_id
    and not exists (select 1 from admins)
  );

-- ---------------------------------------------------------------------------
-- Login usernames — everyone except the admin signs in with a short
-- username instead of typing an email (see lib/username.js for how that
-- turns into a real, made-up Supabase Auth email behind the scenes).
-- Nullable/no-op for existing accounts created before this existed.
-- ---------------------------------------------------------------------------

alter table players add column if not exists username text;
create unique index if not exists players_username_key on players (lower(username));

-- ---------------------------------------------------------------------------
-- Secret missions — short bits of text only the named player can read,
-- shown on their profile page under "My Eyes Only". Sam writes these from
-- the Players panel; sending one also fires a push notification (see
-- push_subscriptions below) if that player has alerts turned on.
-- ---------------------------------------------------------------------------

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
alter table missions enable row level security;

drop policy if exists "missions read own" on missions;
create policy "missions read own" on missions
  for select using (
    exists (select 1 from players p where p.id = missions.player_id and p.user_id = auth.uid())
  );

drop policy if exists "missions write for admins" on missions;
create policy "missions write for admins" on missions
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- ---------------------------------------------------------------------------
-- Push notification subscriptions — one row per device/browser a player has
-- turned mission alerts on for. A player manages their own rows (added when
-- they tap "Turn on mission alerts" on their profile page); the admin route
-- that sends missions reads across all of them using the service role key,
-- which bypasses RLS, so no separate admin-read policy is needed here.
-- ---------------------------------------------------------------------------

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions manage own" on push_subscriptions;
create policy "push_subscriptions manage own" on push_subscriptions
  for all using (
    exists (select 1 from players p where p.id = push_subscriptions.player_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from players p where p.id = push_subscriptions.player_id and p.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Realtime — so every open tab sees Sam's edits live, the same way the
-- original Claude Artifact version did.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'trip_settings'
  ) then
    alter publication supabase_realtime add table trip_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'missions'
  ) then
    alter publication supabase_realtime add table missions;
  end if;
end $$;
