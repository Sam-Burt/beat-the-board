// Shared helpers for username-based logins. Every account still has a real
// Supabase Auth email under the hood — Supabase's accounts are built around
// email as the identifier — but nobody except the admin ever has to know or
// type theirs. For everyone else we make up an email from their username
// (e.g. "dan" -> "dan@players.beat-the-board.local"); nothing is ever sent
// there, it's just a shape Supabase accepts.

const FAKE_EMAIL_DOMAIN = "players.beat-the-board.local";

// Lowercase, letters/numbers/underscore/hyphen/dot only. Keeps usernames
// short, easy to type on a phone, and safe to embed in the fake email above.
export function normalizeUsername(raw) {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "");
}

export function usernameToEmail(username) {
  return `${normalizeUsername(username)}@${FAKE_EMAIL_DOMAIN}`;
}

// What someone types at /login might be their own real email (the admin
// signs in with theirs) or a made-up username (everyone else). If it
// contains "@" treat it as a literal email; otherwise expand it into the
// same fake address the account was created with.
export function loginInputToEmail(raw) {
  const trimmed = (raw || "").trim();
  if (trimmed.includes("@")) return trimmed;
  return usernameToEmail(trimmed);
}
