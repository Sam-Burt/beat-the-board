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
        // let the next send try again.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          dead.push(sub.id);
        }
      }
    })
  );
  return dead;
}

// Sends a generic "you've got a mission" alert (never the mission text
// itself — that stays behind "My Eyes Only" on the missions page) to every
// subscription passed in.
export async function sendMissionPing(subscriptions) {
  return sendPush(subscriptions, {
    title: "🤫 Shhh…",
    body: "You've got a secret mission 👀",
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
    title: "Whoops 🌈",
    body,
    url: "/hot-potato",
    tag: "beat-the-board-hot-potato",
  });
}
