# Beat The Board

The real Centre Parcs leaderboard — same design, same "1 point per player
beaten" scoring — running on your own GitHub + Supabase + Vercel accounts
instead of a Claude Artifact. This gets you real accounts (you sign in as
admin from any device) and a real database, so it's yours to keep and grow.

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
   this project before player accounts existed, re-running this same file
   is safe — it adds the new bits without touching your existing data.)
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

Bookmark `/login` on your phone so signing back in later is quick. Signing
out is a link in the footer while you're signed in.

## 5. Add players and their accounts

Open the **Players** panel (only visible while you're signed in as admin):

- **You (Sam) as a player too:** tick "This is me" so your entry links to
  your existing admin login — no second password to remember.
- **Everyone else:** untick it, enter a made-up email (it doesn't need to
  be real or confirmable — no email actually gets sent) and a password
  (there's a "New" button to generate a random one). After you hit **Create
  account**, their email and password are shown once in a banner — write
  those down or read them out, since they won't be shown again. Give that
  family member the email/password and point them at `your-site.vercel.app/login`.
- Once someone signs in for the first time, they're prompted to pick a
  profile icon (small placeholder icons for now — see "What's not built"
  below for swapping in real artwork).
- Signed-in players who aren't admin get a read-only board, same as anyone
  without an account — the account is there for the profile/icon and for
  future features (see below), not for editing results.

## 6. Test it

- Add a player, log a result, confirm the champion star and leaderboard
  update.
- Sign in as a non-admin player (in a private/incognito window, or on
  another device) and confirm the icon-picker shows up once, the board is
  read-only, and it updates live when you log something from your admin
  device.
- Open the board fully signed out too — confirm it's read-only there as
  well.
- Delete a test result if you ran the optional seed step and want to tidy
  up the "test" entries that came over from the old board.

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
- **Design and scoring are unchanged** — same fonts, colours, dice-pattern
  background, champion star, and the exact "1 point per player beaten"
  rule.

## Swapping in real profile icons

The six icons players pick from (`public/icons/icon-1.png` … `icon-6.png`)
are simple placeholders. When your illustrated versions are ready, replace
those six files with your own artwork — same file names, ideally similar
size (256×256, transparent or square background) — and re-deploy. Nothing
else in the code needs to change; players who already picked an icon just
see the new artwork next time they load the board.

## What's not built (on purpose, for now)

- **Push notifications ("secret missions").** Now that there are real
  accounts, this is genuinely buildable, but it's a separate chunk of work
  (a service worker, web push keys, and — since you said you'd rather send
  these yourself than have them scheduled automatically — a small "send a
  mission" screen only you can see). Worth knowing up front: on iPhone,
  push only works for a player who's added the site to their home screen
  (Safari tabs can't receive push) — that's an Apple restriction, not
  something this app can work around. Ask for it by name when you're ready.
- **Cross-trip crowns/badges.** Carrying a "won the trip" badge across
  separate future trips/events is a natural next step once there's more
  than one trip in the database, but it hasn't been built yet — this
  version is scoped to the one trip you're running now.
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
