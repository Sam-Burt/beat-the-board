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
-- Trips — a "game/trip/event" the board runs for a while, then finalizes.
-- There can be many of these over time, one after another; the most
-- recently created one is treated as "the current trip" by the app (see
-- lib/useBoardData.js). Replaces the old single trip_settings singleton,
-- which is left in place unused rather than dropped (no need to risk data
-- loss over a rename).
-- ---------------------------------------------------------------------------

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  badge_id text,
  starts_on date,
  ends_on date,
  deadline timestamptz,
  status text not null default 'active' check (status in ('active', 'tied', 'finalized')),
  winner_player_id uuid references players (id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

-- Which existing player accounts are playing in a given trip. Player
-- accounts (login, icon, missions, push subscriptions) live forever and
-- are created once; a trip's roster is just which of them are "in" this
-- particular trip.
create table if not exists trip_players (
  trip_id uuid not null references trips (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  primary key (trip_id, player_id)
);

-- Every logged round now belongs to a trip. Nullable so this column can be
-- added to a database that already has rows (backfilled below); the app
-- always sets it on new inserts.
alter table events add column if not exists trip_id uuid references trips (id) on delete cascade;

-- Free-form point awards/deductions — on top of the automatic "1 point per
-- person you beat" scoring from logged rounds above, Sam can hand out (or
-- take away) an arbitrary number of points at any time, e.g. "+3 for doing
-- the washing up without being asked" or "-2 for getting caught out on a
-- secret mission". Scoped to a trip the same way logged rounds are.
create table if not exists point_adjustments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  amount integer not null,
  note text default '',
  created_at timestamptz not null default now()
);

-- One row per trip once it's finalized and has a winner — this is what
-- powers the "Trophies" collection on a player's profile page and the
-- crown next to their name on the leaderboard. Snapshots the trip's name,
-- badge and final point total at the moment of winning, so a trophy still
-- reads correctly even if the trip row it came from is later renamed.
create table if not exists trophies (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references trips (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  trip_name text not null,
  badge_id text,
  points integer not null default 0,
  starts_on date,
  ends_on date,
  awarded_at timestamptz not null default now()
);

alter table trips enable row level security;
alter table trip_players enable row level security;
alter table point_adjustments enable row level security;
alter table trophies enable row level security;

drop policy if exists "trips read for everyone" on trips;
create policy "trips read for everyone" on trips
  for select using (true);
drop policy if exists "trips write for admins" on trips;
create policy "trips write for admins" on trips
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

drop policy if exists "trip_players read for everyone" on trip_players;
create policy "trip_players read for everyone" on trip_players
  for select using (true);
drop policy if exists "trip_players write for admins" on trip_players;
create policy "trip_players write for admins" on trip_players
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

drop policy if exists "point_adjustments read for everyone" on point_adjustments;
create policy "point_adjustments read for everyone" on point_adjustments
  for select using (true);
drop policy if exists "point_adjustments write for admins" on point_adjustments;
create policy "point_adjustments write for admins" on point_adjustments
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

drop policy if exists "trophies read for everyone" on trophies;
create policy "trophies read for everyone" on trophies
  for select using (true);
drop policy if exists "trophies write for admins" on trophies;
create policy "trophies write for admins" on trophies
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- One-time backfill: if this database predates trips entirely, create one
-- from whatever's already there (the old trip_settings name, every
-- existing player, every existing logged round) so nothing already on the
-- board gets lost when this update goes live. Guarded so it only ever
-- fires once, even though this whole file gets re-run on every update.
do $$
declare
  first_trip_id uuid;
begin
  if not exists (select 1 from trips) then
    insert into trips (name, status)
    select coalesce(trip_name, 'Centre Parcs Trip'), 'active' from trip_settings where id = 1
    returning id into first_trip_id;

    if first_trip_id is null then
      insert into trips (name, status) values ('Centre Parcs Trip', 'active')
      returning id into first_trip_id;
    end if;

    insert into trip_players (trip_id, player_id)
    select first_trip_id, id from players
    on conflict do nothing;

    update events set trip_id = first_trip_id where trip_id is null;
  end if;
end $$;

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
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table trips;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'trip_players'
  ) then
    alter publication supabase_realtime add table trip_players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'point_adjustments'
  ) then
    alter publication supabase_realtime add table point_adjustments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'trophies'
  ) then
    alter publication supabase_realtime add table trophies;
  end if;
end $$;
