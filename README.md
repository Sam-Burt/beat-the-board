# Beat The Board

The real Centre Parcs leaderboard — same design, same standard "1 point per
player beaten" scoring for every logged round, plus the ability to hand out
one-off bonus/penalty points — running on your own GitHub + Supabase +
Vercel accounts instead of a Claude Artifact. This gets you real accounts
(you sign in as admin from any device) and a real database, so it's yours
to keep and grow.

No coding experience needed for the steps below — just following along and
clicking the right buttons.

## What you're setting up

- **Supabase** — the database. Holds players, results, and the trip name.
- **GitHub** — where the code lives, so Vercel can build it.
- **Vercel** — hosts the live site everyone visits.

You said you already have accounts on all three, so skip straight to step 1.

---

## 1. Create the Supabase project

1. In Supabase, click **New project**. Pick any name (e.g. "beat-the-board"),
   set a database password (save it somewhere — you likely won't need it
   again), pick a region close to you, and create it. Takes about a minute
   to finish provisioning.
2. Once it's ready, open the **SQL Editor** (left sidebar) → **New query**.
3. Open `supabase/schema.sql` from this project, copy the whole file, paste
   it into the SQL editor, and click **Run**. This creates the tables and
   the security rules that only let you edit the board. (If you deployed
   this project before, re-running this same file is always safe — it only
   adds new bits, never touches existing data. If your board already had
   players and results before trips existed, running this file once
   automatically creates "Trip #1" from what was already there — current
   name, players and history — so nothing is lost; you don't need to do
   anything else.)
4. *(Optional)* If you want to bring over the players and results already
   on the Claude Artifact version instead of starting empty: open a new
   query, paste in `supabase/seed.sql`, and run it too. You can always add
   or delete players/results from the app itself afterwards.
5. Go to **Settings → API**. You'll need three values from this page in
   step 3 below: the **Project URL**, the **anon public** key (newer
   Supabase dashboards call this the **Publishable key**, starting
   `sb_publishable_...` — same thing), and the **service_role** key
   (newer dashboards call this the **Secret key**, starting `sb_secret_...`
   — click "Reveal" and keep this one secret, don't put it anywhere but
   Vercel's environment variables).
6. *(Optional, only if you want the "forgot password" link to work)* Go to
   **Authentication → URL Configuration** and add
   `https://your-site.vercel.app/reset-password` to **Redirect URLs**
   (swap in your real Vercel URL once you have it from step 3 below — you
   can come back and add this after deploying).

## 2. Get the code onto GitHub

No git or command line needed:

1. On GitHub, click **New repository**. Name it `beat-the-board`, keep it
   **Private** (recommended, since anyone with the repo could see your
   Supabase URL — though not your password), and create it without a
   README (you already have one).
2. On the new repo's page, click **uploading an existing file**.
3. Drag in every file and folder from this project *except* anything named
   `node_modules` (there isn't one here) — drag-and-drop preserves folder
   structure, so `app/`, `components/`, `lib/`, `public/`, and `supabase/`
   will all land correctly as subfolders.
4. Commit the upload.

## 3. Import into Vercel

1. In Vercel, click **Add New → Project**, and import the `beat-the-board`
   GitHub repo you just created.
2. Before deploying, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` — the Project URL from Supabase step 1.5
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon public / Publishable key
     from the same page
   - `SUPABASE_SERVICE_ROLE_KEY` — the service_role / Secret key from the
     same page. This one is what lets you create real logins for other
     players from the Players panel — don't add the `NEXT_PUBLIC_` prefix
     to it, or it would be exposed to every visitor's browser.
   - *(Optional — only needed for mission-alert phone notifications, see
     step 7)* `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
3. Click **Deploy**. Takes a minute or two the first time.
4. Once it's live, Vercel gives you a URL like
   `beat-the-board-yourname.vercel.app` — that's your new board.

## 4. Create your admin account

The site starts with no admin, so anyone who opens it just sees a read-only
board (or an empty one, if you skipped the seed data).

1. Visit `your-site.vercel.app/admin/setup`.
2. Enter an email and password — this is now the *only* account that can
   edit the board. Nobody else can create one from the site itself.
3. You'll land back at `/login` — sign in there, then go back to the home
   page. You should now see the "Log a result" and "Players" panels, and
   the pencil icon next to the trip name.

Bookmark `/login` on your phone so signing back in later is quick. Once
you're signed in, a tab bar appears at the bottom of the screen (Board /
Missions / Profile) — that's how everyone gets around. Signing out is a
button at the bottom of the Profile tab.

## 5. Add players and their accounts

Open the **Players** panel (only visible while you're signed in as admin):

- **You (Sam) as a player too:** tick "This is me" so your entry links to
  your existing admin login — no second password to remember.
- **Everyone else:** untick it, pick a short username for them (just
  letters/numbers, e.g. `alfie` — this is what they'll always type to sign
  in, not a real email, and it's permanent — nobody can change it
  themselves later) and a password (there's a "New" button to generate a
  random one). After you hit **Create account**, their username and
  password are shown once in a banner — write those down or read them
  out, since they won't be shown again. Give that family member the
  username/password and point them at `your-site.vercel.app/login`.
- Once someone signs in for the first time, they're prompted to pick a
  profile icon (small placeholder icons for now — see "Swapping in real
  profile icons" below).
- Signed-in players who aren't admin get a read-only board, same as anyone
  without an account, plus their own **Profile and Missions tabs** at the
  bottom of the screen (see step 7) — the account is there for the
  profile/icon/missions, not for editing results.

## 6. Test it

- Add a player, log a result, confirm the champion star and leaderboard
  update.
- Sign in as a non-admin player (in a private/incognito window, or on
  another device) and confirm the icon-picker shows up once, their chosen
  icon shows properly on their Profile tab (not a blank/dark circle), the
  board is read-only, and it updates live when you log something from your
  admin device.
- Open the board fully signed out too — confirm it's read-only there as
  well.
- Delete a test result if you ran the optional seed step and want to tidy
  up the "test" entries that came over from the old board.

## 7. The bottom tab bar, secret missions & phone alerts (optional)

Every signed-in player gets a tab bar fixed to the bottom of the screen —
**Board**, **Missions**, **Profile**:

- **Board** is the leaderboard (and, for you, the "Log a result" and
  "Players" panels).
- **Profile** has a big version of their icon (tap it to change any time),
  their display name (editable any time — this is what shows on the board,
  separate from the fixed username they sign in with), a "Sign out"
  button, and the "Turn on mission alerts" switch described below.
- **Missions** has a face-down card labelled **"My Eyes Only"** — tap it to
  flip it over and reveal any secret missions you've sent them, and tap
  again to flip it back down. Nobody but them (not even you, unless you
  check the database directly) can see it there.

**To send someone a mission:** in the Players panel, tap **Mission** next
to their name, type it, and hit **Send mission**. It appears on their
Missions tab immediately.

**For an actual phone alert** ("ping!") when a mission lands, instead of
them having to check the app:

1. Generate a key pair once, from a terminal with Node installed:
   ```
   npx web-push generate-vapid-keys
   ```
   (Or ask whoever set this up for you to run it and send you the two
   keys.)
2. In Vercel's Environment Variables, add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   (the public key) and `VAPID_PRIVATE_KEY` (the private one — keep this
   one secret, same as the Supabase service role key) for all environments,
   then redeploy.
3. Each player taps **Turn on mission alerts** on their own Profile tab
   (has to be them, on their own device — it's a permission only a person
   can grant for themselves).

The notification itself never shows the mission text — just "you've got a
new secret mission" — so a locked phone on the coffee table doesn't spoil
anything. The real text only ever shows up behind My Eyes Only, after
signing in.

**On iPhone specifically:** Apple only allows push alerts for a site
that's been added to the Home Screen and opened from there — a regular
Safari tab can't receive them. The Profile tab explains this and walks
through it (Share → Add to Home Screen) if it detects you're on an iPhone
and haven't done that yet. Missions still show up on the Missions tab
either way, with or without phone alerts turned on.

---

## 8. Trips, bonus points & trophies (optional)

The board now runs in **trips** — a trip is the overall "game weekend"
(what you called a "game/trip/event"), with its own name, badge, roster,
date window and deadline. Every logged round and bonus/penalty point
belongs to whichever trip is current; only one trip can be running at a
time.

**Starting a trip:** open the **Trip** panel (admin only, above "Log a
result"), give it a name, pick a badge from the small placeholder
collection (swap in your own artwork any time — see below), optionally set
a start/end date window, set a **deadline** (the moment that decides the
winner), and tick who's playing from your player accounts. Hit **Start
trip** and the board, "Log a result" and the Players panel all scope to
that roster.

**Ending a trip:** once the deadline passes, the trip finalizes itself
automatically the next time you (the admin) have the app open — there's no
server running in the background to do it on the dot, so this is a
"catches up next time you look" design, which is fine for a family trip.
You can also end it early any time with **End trip now** in the Trip
panel. Either way, whoever's top of the board at that moment wins the
trophy — unless it's an exact tie, in which case the trip is marked "tied"
and the Trip panel shows a **pick the winner** prompt so you make the call
by hand rather than the app guessing.

**Bonus/penalty points:** in the Players panel, anyone currently on the
trip roster gets a **±Points** button — award points on demand (e.g. "+3
for doing the washing up without being asked") or dock them (e.g. "-2 for
getting caught on a secret mission"), with an optional note. These stack
on top of the normal per-round scoring and show up in the History list
alongside logged rounds, so it's always clear where someone's points came
from.

**Trophies & crowns:** winning a trip adds a trophy to that player's
**Trophies** card on their Profile tab — a 3×3 (or bigger, once they've
won enough to need it) grid of circular slots that fill in as they win.
Tap a filled slot for a popup with that trip's name, dates and final
score. Anyone with at least one trophy also gets a small crown next to
their name on the leaderboard, with a number next to it once they've won
more than once.

**Trip badges:** the 9 trophy badges under `public/badges/` are simple
placeholders in the app's own colours. Replace `badge-1.png` …
`badge-9.png` with your own illustrated artwork whenever it's ready (same
file names, square, 512×512px works well) and re-deploy — nothing else
needs to change, and trips that already picked a placeholder just show the
new artwork next time the badge loads.

---

## How this differs from the old Claude Artifact version

- **Real accounts, for everyone.** Your one admin login can edit — enforced
  by the database itself (Supabase Row Level Security), not just by who has
  the link. Other players can have their own login too (you create it for
  them), which gives each of them a small profile with a chosen icon, and
  sets up the ground for the features below.
- **A real database**, not a single self-publishing page. Multiple people
  can have the board open at once and it stays in sync live (Supabase
  Realtime).
- **Design and the core scoring rule are unchanged** — same fonts, colours,
  dice-pattern background, champion star, and the standard "1 point per
  player beaten" rule for logged rounds — with trips, bonus/penalty points
  and trophies layered on top (see step 8 above).

## Swapping in real profile icons

The six icons players pick from (`public/icons/icon-1.png` … `icon-6.png`)
are simple placeholders. When your illustrated versions are ready, replace
those six files with your own artwork — same file names, ideally square,
512×512px works well (they're always shown small, but that keeps them
sharp on retina phone screens) — and re-deploy. Nothing
else in the code needs to change; players who already picked an icon just
see the new artwork next time they load the board.

## What's not built (on purpose, for now)

- **A frame for winning a big trip.** The idea of a special frame around a
  player's icon or trophy for a standout event (like this Centre Parcs
  trip) is a nice future addition but isn't built — right now every trophy
  looks the same regardless of how big the trip was.
- **No server-side cron for the trip deadline.** Finalizing a trip relies
  on an admin having the app open some time after the deadline passes (or
  using "End trip now" manually) — see step 8. Fine for a small family app,
  but worth knowing if a trip's deadline passes while nobody signed in as
  admin opens the site for a while.
- **No automated tests**, and the "delete" actions are immediate once
  confirmed (no undo) — same as the old version.

## Local development (optional)

If you ever want to run this on your own computer before pushing changes:

```
npm install
cp .env.local.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Then open `http://localhost:3000`.
