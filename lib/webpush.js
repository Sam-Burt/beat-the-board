// SERVER-ONLY. Wraps the `web-push` library with this project's VAPID keys
// so app/api/admin/send-mission/route.js can push a "you've got a mission"
// alert to a player's subscribed devices. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY
// (also used client-side to subscribe, see lib/push.js) and the server-only
// VAPID_PRIVATE_KEY — generate a pair once with
// `npx web-push generate-vapid-keys` and put them in Vercel's Environment
// Variables (see README).

import webpush from "web-push";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

export const pushConfigured = !!(publicKey && privateKey);

if (pushConfigured) {
  // The subject just has to be a URI — the push service never contacts it,
  // it's only there in case a push service operator needs to reach the
  // sender about abuse. A generic mailto: is fine for a small family app.
  webpush.setVapidDetails("mailto:admin@beat-the-board.app", publicKey, privateKey);
}

// Sends an arbitrary push payload (title/body/url/tag) to every subscription
// passed in — the shared low-level sender behind sendMissionPing below and
// the Hot Potato pass alert. Returns which subscriptions are dead (expired
// or the browser unsubscribed) so the caller can clean them up.
export async function sendPush(subscriptions, payload) {
  const dead = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        // 404/410 = the subscription is gone (browser data cleared,
        // notifications revoked, etc.) — anything else, leave it alone and
        // let the next send try again. Log every failure either way: this
        // used to swallow everything silently, which meant "the push never
        // arrived" had no trail to follow — just a mission that looked sent
        // from the admin's side with nothing to show for it on the phone.
        console.error(
          `push send failed for subscription ${sub.id}: ${err?.statusCode || "no status"} ${err?.body || err?.message || err}`
        );
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          dead.push(sub.id);
        }
      }
    })
  );
  return dead;
}

// Sends a generic "you've got a mission" alert (never the mission text
// itself — that stays on the missions page, behind an app open) to every
// subscription passed in.
export async function sendMissionPing(subscriptions) {
  return sendPush(subscriptions, {
    title: "😈 Mission for you, prick",
    body: "Someone thinks you can handle this. Prove them wrong.",
    url: "/missions",
    tag: "beat-the-board-mission",
  });
}

// Sends the "the card just landed on you" alert for the Gay Card game
// (internal code/table names still say "hot potato" — same UI-text-vs-code
// split as trip/Event, see the project doc). `body` is supplied by the
// caller so it can name who passed it (or say nothing, for the very first
// deal at game start).
export async function sendHotPotatoPing(subscriptions, body) {
  return sendPush(subscriptions, {
    title: "GAAAAAYYYYY🌈",
    body,
    url: "/hot-potato",
    tag: "beat-the-board-hot-potato",
  });
}

// Sent to every player on the roster the moment a trip finalizes (deadline
// passed, or the admin broke a tie) — same "tease, don't spoil" pattern as
// missions/Hot Potato: names the event, not the winner, so opening the app
// is what actually tells you whether you're celebrating or sulking.
export async function sendEventEndedPing(subscriptions, tripName) {
  return sendPush(subscriptions, {
    title: "🏁 Game over, you pricks.",
    body: `${tripName} is over. One of you actually won. The rest of you were fucking useless.`,
    url: "/",
    tag: "beat-the-board-event-ended",
  });
}

// Sent to the whole roster when the admin corrects a score after an event's
// already been decided and it changes who won — see
// app/api/admin/revise-score. Same "open the app to find out" pattern: the
// notification itself never names the new winner, the VAR popup does that
// (see components/EventCelebration.js's variant="var").
export async function sendVarPing(subscriptions) {
  return sendPush(subscriptions, {
    title: "📺 VAR: Cheating Bastard",
    body: "Someone's been caught cheating. Was it you? God, you people are fucking desperate.",
    url: "/",
    tag: "beat-the-board-var",
  });
}

// Sent to the target the moment Leroy actually strikes (see
// app/api/leroy/reveal) — never at send time, since sending is silent by
// design. Never names the sender; that's the whole point of the 60-second
// guessing game the in-app popup (components/LeroyAlert.js) runs next.
export async function sendLeroyPing(subscriptions, body) {
  return sendPush(subscriptions, {
    title: "🥷 You've been Leroy'd",
    body,
    url: "/tricks",
    tag: "beat-the-board-leroy",
  });
}

// Sent to the recipient the moment another player proposes a mission trade
// (see app/api/missions/propose-trade) — `title` is built by the caller so
// it can name who's offering. This is the one that matters: it's what sends
// them into the blocking accept/decline popup next time they open the app
// (see components/TradeAlert.js), so there's no "later" for this one.
export async function sendTradeRequestPing(subscriptions, title) {
  return sendPush(subscriptions, {
    title,
    body: "They want to swap. Go see what you're being lumbered with.",
    url: "/missions",
    tag: "beat-the-board-trade",
  });
}

// Sent back to whoever proposed a trade once the other player's actually
// dealt with it (see app/api/missions/respond-trade) — never before, since
// there's nothing to tell them until a decision's been made.
export async function sendTradeResponsePing(subscriptions, accepted) {
  return sendPush(subscriptions, {
    title: accepted ? "🤝 Trade's on" : "🙅 Trade's dead",
    body: accepted
      ? "They took it. Go see what you're stuck with now."
      : "They took one look and said no.",
    url: "/missions",
    tag: "beat-the-board-trade-response",
  });
}

// Sent to EVERY player the moment someone requests Jackpot (app/api/tricks/
// boost) — unlike Leroy, this one's public on purpose: the whole point is
// public pressure while it sits waiting on an admin to confirm it (see
// app/api/admin/confirm-boost). `title` is built by the caller so it can
// name whoever's asking.
export async function sendJackpotRequestPing(subscriptions, title) {
  return sendPush(subscriptions, {
    title,
    body: "Let's see if Barry Big Bollocks bottles it.",
    url: "/tricks",
    tag: "beat-the-board-jackpot-request",
  });
}
