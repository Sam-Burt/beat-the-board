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

-- "Removing" a player never hard-deletes the row — past rounds
-- (events.ranking), point adjustments and trophies all still reference
-- their id, and should keep reading their real name forever, not a
-- generic "(removed)" placeholder. deleted_at is what "removed" actually
-- means: their login is revoked and they drop off every active
-- roster/picker (see app/api/admin/delete-player/route.js), but the row —
-- and their name — stays for history to resolve against.
alter table players add column if not exists deleted_at timestamptz;
create unique index if not exists players_user_id_key on players (user_id);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  note text default '',
  ranking uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Team scoring: a logged round's ranking is now an ordered array of
-- placement *groups* (jsonb) instead of a flat list of player ids — each
-- group is whoever tied for that position, so a doubles match at tennis
-- or badminton logs as one team per placement rather than forcing an
-- arbitrary order between teammates ([[a,b],[c,d]] beats a coin flip
-- between a and b). A normal solo result is just a run of singleton
-- groups. See lib/points.js eventPoints() for how a group's points split
-- evenly across its members.
alter table events drop column if exists ranking;
alter table events add column if not exists ranking jsonb not null default '[]'::jsonb;

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

-- Missions never had a trip_id, unlike everything else (events,
-- point_adjustments, hot_potato_*) — so the Missions tab kept showing every
-- mission ever sent, forever, instead of resetting when one event ends and
-- the next starts. Nullable/backfilled as null on purpose: old missions
-- from before this column existed just stop showing up for any current
-- trip, which is the right outcome for them anyway.
alter table missions add column if not exists trip_id uuid references trips (id) on delete cascade;

-- Every mission now needs photo proof: 'pending' until the player either
-- uploads a photo (-> 'completed', see app/api/missions/upload-proof) or
-- declines it (-> 'declined', see app/api/missions/decline). Both routes
-- run server-side with the service role key — a player never gets to set
-- their own status directly, same trust model as everything else admin-ish
-- in this app.
alter table missions add column if not exists status text not null default 'pending'
  check (status in ('pending', 'completed', 'declined'));
alter table missions add column if not exists photo_url text;
alter table missions add column if not exists responded_at timestamptz;

-- Missions stay private to the player they were sent to while their trip is
-- still live (the existing "read own" policy below) — but once that trip
-- finalizes, everyone reviews everyone's missions together (see the Secret
-- Missions Review page), so reads open up for that one trip once it's done.
drop policy if exists "missions read once trip finalized" on missions;
create policy "missions read once trip finalized" on missions
  for select using (
    exists (select 1 from trips t where t.id = missions.trip_id and t.status = 'finalized')
  );

drop policy if exists "missions read own" on missions;
create policy "missions read own" on missions
  for select using (
    exists (select 1 from players p where p.id = missions.player_id and p.user_id = auth.uid())
  );

drop policy if exists "missions write for admins" on missions;
create policy "missions write for admins" on missions
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- Mission proof photos. Public bucket (same trust model as the rest of this
-- schema — e.g. hot_potato_history is readable at the DB level to anyone,
-- the app just doesn't surface it in the UI at the wrong time) so plain
-- <img src> works with no signed URLs. Nobody uploads to it directly: only
-- app/api/missions/upload-proof, server-side with the service role key,
-- which is what actually enforces "only your own pending mission".
insert into storage.buckets (id, name, public)
values ('mission-photos', 'mission-photos', true)
on conflict (id) do nothing;

-- Missions are now worth points, paid out as a point_adjustments row (same
-- table/mechanism as the admin's free-form point awards, so it shows up in
-- History for free) the moment app/api/missions/upload-proof marks one
-- completed. Set wherever a mission is actually created — by hand, from the
-- pool, or via the scheduler — never guessed after the fact.
alter table missions add column if not exists points integer not null default 5;
alter table mission_templates add column if not exists points integer not null default 5;
alter table scheduled_missions add column if not exists points integer;

-- A queued mission belongs to the event it was queued for, and dies with it
-- (see lib/tripFinalize.js, which clears the pending queue when an event
-- finishes). Previously the trip was resolved at fire time instead, so a
-- mission could outlive its event and land attached to nothing — the player
-- got the alert, opened the app, and found an empty Missions tab, because
-- that list is scoped to the current event. Nullable only because rows
-- predating this column exist; lib/processDue.js bins those rather than
-- firing them.
alter table scheduled_missions add column if not exists trip_id uuid references trips (id) on delete cascade;

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

-- A trophy's snapshotted point total can now be a half-integer (a team
-- splitting an odd block of placement points from a team-scored round,
-- e.g. 2.5 each) — widen from integer so that value isn't rejected.
alter table trophies alter column points type numeric using points::numeric;

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
-- Mission title + a task pool the admin can pre-fill, so "send a mission"
-- doesn't always mean typing one out fresh. A mission can either be typed
-- by hand (title/text set directly) or picked at random from the pool —
-- the send-mission API route resolves "random" server-side so the admin
-- genuinely doesn't see which one went out.
-- ---------------------------------------------------------------------------

alter table missions add column if not exists title text;

create table if not exists mission_templates (
  id uuid primary key default gen_random_uuid(),
  title text,
  text text not null,
  created_at timestamptz not null default now()
);
alter table mission_templates enable row level security;

drop policy if exists "mission_templates admin only" on mission_templates;
create policy "mission_templates admin only" on mission_templates
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- A mission queued to go out later, at a time the admin picked but doesn't
-- have to remember or be present for — see app/api/process-due/route.js,
-- which any signed-in player's device opportunistically triggers on load
-- (same "no server cron needed" spirit as the trip auto-finalize check in
-- lib/useBoardData.js). random=true means "pick from mission_templates at
-- the moment this actually fires" rather than using a fixed title/text, so
-- even the admin doesn't know which one landed.
create table if not exists scheduled_missions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  title text,
  text text,
  random boolean not null default false,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table scheduled_missions enable row level security;

drop policy if exists "scheduled_missions admin only" on scheduled_missions;
create policy "scheduled_missions admin only" on scheduled_missions
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- ---------------------------------------------------------------------------
-- Hot Potato — a secret item-passing game, toggled on per-event. One player
-- starts out holding it (assigned at random when the admin triggers the
-- start); from then on the current holder secretly plants it on another
-- player and confirms the pass in the app, which is what actually moves
-- holder_id along and fires that player's "you've been tagged" alert.
-- Whoever's holding it when the event's deadline hits takes a points hit
-- (see lib/tripFinalize.js). Holder identity is deliberately NOT surfaced
-- in the UI to anyone but the holder themselves and the admin — read access
-- is left open at the database level (small trusted family app, same trust
-- model as the rest of this schema) but the app just doesn't display it.
-- ---------------------------------------------------------------------------

alter table trips add column if not exists hot_potato_enabled boolean not null default false;

create table if not exists hot_potato_state (
  trip_id uuid primary key references trips (id) on delete cascade,
  holder_id uuid references players (id) on delete set null,
  note text default '',
  started_at timestamptz,
  last_passed_at timestamptz
);
alter table hot_potato_state enable row level security;

drop policy if exists "hot_potato_state read for everyone" on hot_potato_state;
create policy "hot_potato_state read for everyone" on hot_potato_state
  for select using (true);
drop policy if exists "hot_potato_state write for admins" on hot_potato_state;
create policy "hot_potato_state write for admins" on hot_potato_state
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

create table if not exists hot_potato_history (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  from_player_id uuid references players (id) on delete set null,
  to_player_id uuid not null references players (id) on delete cascade,
  note text default '',
  created_at timestamptz not null default now()
);
alter table hot_potato_history enable row level security;

drop policy if exists "hot_potato_history read for everyone" on hot_potato_history;
create policy "hot_potato_history read for everyone" on hot_potato_history
  for select using (true);
drop policy if exists "hot_potato_history write for admins" on hot_potato_history;
create policy "hot_potato_history write for admins" on hot_potato_history
  for all using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));

-- ---------------------------------------------------------------------------
-- Notification history — every push alert (secret mission or Hot Potato
-- pass) also gets logged here, so a player who missed, misread, or
-- misclicked the actual phone notification can look it back up from the
-- bell in the app. Always written server-side with the service role key;
-- a player can read and mark-read only their own rows.
-- ---------------------------------------------------------------------------

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table notifications enable row level security;

-- Postgres only ships the primary key in a DELETE's "old row" by default, so
-- the filtered realtime subscriptions in NotificationBell/BottomNav
-- (`filter: player_id=eq....`) never matched a delete and "Clear all" looked
-- broken — the row really was gone, the open tab just never heard about it.
-- Full replica identity puts every column on the old row so those filters
-- can match deletes too.
alter table notifications replica identity full;

drop policy if exists "notifications read own" on notifications;
create policy "notifications read own" on notifications
  for select using (
    exists (select 1 from players p where p.id = notifications.player_id and p.user_id = auth.uid())
  );
drop policy if exists "notifications mark read own" on notifications;
create policy "notifications mark read own" on notifications
  for update using (
    exists (select 1 from players p where p.id = notifications.player_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from players p where p.id = notifications.player_id and p.user_id = auth.uid())
  );
drop policy if exists "notifications delete own" on notifications;
create policy "notifications delete own" on notifications
  for delete using (
    exists (select 1 from players p where p.id = notifications.player_id and p.user_id = auth.uid())
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
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mission_templates'
  ) then
    alter publication supabase_realtime add table mission_templates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'scheduled_missions'
  ) then
    alter publication supabase_realtime add table scheduled_missions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'hot_potato_state'
  ) then
    alter publication supabase_realtime add table hot_potato_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'hot_potato_history'
  ) then
    alter publication supabase_realtime add table hot_potato_history;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'leroy_sends'
  ) then
    alter publication supabase_realtime add table leroy_sends;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'point_boosts'
  ) then
    alter publication supabase_realtime add table point_boosts;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cron heartbeat — Postgres itself pings app/api/cron every 5 minutes via
-- pg_cron + pg_net, so event deadlines finalize and scheduled missions send
-- on time instead of waiting for someone to open the app. See that route
-- for what actually runs; this just triggers it.
--
-- NOT run automatically by this file — it contains the CRON_SECRET, which
-- doesn't belong in a file that gets committed to git. Run this by hand in
-- the SQL Editor once, replacing YOUR_CRON_SECRET with the real value (the
-- same one set as CRON_SECRET in Vercel's environment variables):
--
--   create extension if not exists pg_cron with schema extensions;
--   create extension if not exists pg_net with schema extensions;
--
--   select cron.schedule(
--     'beat-the-board-heartbeat',
--     '*/5 * * * *',
--     $$select net.http_post(
--       url := 'https://beat-the-board.vercel.app/api/cron',
--       headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET'),
--       timeout_milliseconds := 15000
--     );$$
--   );
--
-- The 15s timeout matters more than it looks like it should: pg_net's
-- default is 5000ms, and a cold Vercel function plus a couple of Supabase
-- round-trips can take longer than that to answer, which silently drops
-- every run until you notice net._http_response full of timeout errors.
--
-- cron.schedule() upserts by job name, so re-running this to change
-- anything (a new secret, a different interval) is safe — it replaces the
-- existing job rather than creating a duplicate. To check on it later:
--   select * from cron.job;                                    -- is it registered and active
--   select * from cron.job_run_details order by start_time desc limit 5;  -- did it fire
--   select * from net._http_response order by id desc limit 5;           -- did the request succeed

-- ---------------------------------------------------------------------------
-- VAR — the admin correcting scores after an event's already finalized
-- (someone's proof turns out to be fake, a mission was claimed but not
-- actually done, whatever it is). See app/api/admin/revise-score. Every
-- other write in this app either happens live or never happens again once
-- an event's over; this is the one deliberate exception, and only the
-- admin can reach it.
-- ---------------------------------------------------------------------------

-- Set only when a trophy is reassigned after already being awarded once —
-- distinguishes "first time this trip got a winner" from "the winner just
-- changed" so useEventCelebration (see lib/) can tell a fresh win from a
-- VAR overturn, and so the per-player "have I seen this trophy" dismissal
-- key changes and the popup shows again for everyone even if they already
-- dismissed the original announcement.
alter table trophies add column if not exists revised_at timestamptz;

-- Set on a post-finalization NEGATIVE score revision from the admin —
-- drives the second icon next to the crown on the leaderboard (see
-- components/Board.js). Not a running count: it's a sticky flag that
-- clears itself the next time this player plays a round at all — win,
-- lose, whatever (see saveEvent in lib/useBoardData.js) — which also
-- voids that round's points and costs them 5 more, as the penalty.
alter table players add column if not exists cheat_flagged boolean not null default false;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'players' and column_name = 'cheat_count'
  ) then
    update players set cheat_flagged = true where cheat_count > 0;
    alter table players drop column cheat_count;
  end if;
end $$;

-- Leroy: any player can send him after exactly one other player, once per
-- event, to steal points off them — same delayed-trigger shape as the
-- cheat flag (see above), resolved the next time the target plays any
-- round, not necessarily one they win.
create table if not exists leroy_sends (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  sender_id uuid not null references players (id) on delete cascade,
  target_id uuid not null references players (id) on delete cascade,
  amount integer not null default 5,
  sent_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table leroy_sends enable row level security;

drop policy if exists "leroy_sends read for everyone" on leroy_sends;
create policy "leroy_sends read for everyone" on leroy_sends
  for select using (true);

-- Sending is completely silent — no notification, no push, nothing —
-- since the whole point is the target has no idea. He no longer has an
-- expiry either (that was the original design; dropped below): he just
-- waits for the target's next round, however long that takes. The moment
-- he strikes, the target gets a notification and 60 seconds
-- (guess_deadline) to guess who sent him — right, and they get their 5
-- back plus 5 more out of the sender's pocket; wrong or too slow, and
-- they never find out. See app/api/leroy/send, app/api/leroy/reveal and
-- app/api/leroy/guess — every write goes through one of those three
-- service-role routes now, so there's no client-facing write policy at
-- all any more, not even for the admin.
alter table leroy_sends add column if not exists guess_deadline timestamptz;
alter table leroy_sends add column if not exists guessed_player_id uuid references players (id) on delete set null;
alter table leroy_sends add column if not exists guess_correct boolean;
alter table leroy_sends add column if not exists guessed_at timestamptz;
alter table leroy_sends drop column if exists expires_at;
drop policy if exists "leroy_sends write for admins" on leroy_sends;

-- Jackpot ("boost" internally): the self-directed counterpart to Leroy —
-- a player activates it on themselves, once per event, and it doubles
-- whatever they score in their next round. Same delayed-trigger shape
-- and 18-hour shelf life as Leroy, resolved alongside it in saveEvent,
-- but the two never interact: Leroy is always a flat 5 regardless of any
-- boost in play, and a boost never inflates what Leroy steals — see the
-- comment in lib/useBoardData.js for why. A cheat-flagged round overrides
-- a boost outright: there's nothing positive left to double once the
-- cheat penalty has voided it.
create table if not exists point_boosts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz
);
alter table point_boosts enable row level security;

drop policy if exists "point_boosts read for everyone" on point_boosts;
create policy "point_boosts read for everyone" on point_boosts
  for select using (true);

-- Activating only ever happens through app/api/tricks/boost (service
-- role, checked server-side: real player, hasn't already used theirs
-- this trip) — no insert policy needed for ordinary clients. Resolving
-- one is a plain admin write from saveEvent, same as Leroy.
drop policy if exists "point_boosts write for admins" on point_boosts;
create policy "point_boosts write for admins" on point_boosts
  for update using (auth.uid() in (select user_id from admins))
  with check (auth.uid() in (select user_id from admins));
