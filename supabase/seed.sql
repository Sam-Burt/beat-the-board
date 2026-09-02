-- Optional: run this AFTER schema.sql if you want to bring over the
-- players and results already logged on the Claude Artifact version,
-- instead of starting the board empty.
--
-- Safe to re-run — it clears players/events first so you don't get
-- duplicates if you run it twice.

delete from events;
delete from players;

-- Players (fixed ids so the event rankings below can reference them)
insert into players (id, name, emoji) values
  ('00000000-0000-0000-0000-000000000001', 'Sam', ''),
  ('00000000-0000-0000-0000-000000000002', 'April', ''),
  ('00000000-0000-0000-0000-000000000003', 'Jedd', ''),
  ('00000000-0000-0000-0000-000000000004', 'Ernie', '');

-- Events, ranking = finish order, winner first. This carries over
-- everything that was logged on the old board, "test" entries included —
-- delete any you don't want to keep from the Players/History screens
-- once the app is live.
insert into events (name, event_date, note, ranking) values
  ('Biggo', '2026-09-02', '', array[
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004'
  ]::uuid[]),
  ('swimming', '2026-09-02', '', array[
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001'
  ]::uuid[]),
  ('test', '2026-09-02', '', array[
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001'
  ]::uuid[]),
  ('who''s the most gay', '2026-09-02', '', array[
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000003'
  ]::uuid[]),
  ('test', '2026-09-02', '', array[
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001'
  ]::uuid[]),
  ('test', '2026-09-01', '', array[
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004'
  ]::uuid[]);

update trip_settings set trip_name = 'Centre Parcs Trip' where id = 1;
