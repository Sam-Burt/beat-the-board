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

// Sends a generic "you've got a mission" alert (never the mission text
// itself — that stays behind "My Eyes Only" on the profile page) to every
// subscription passed in. Returns which subscriptions are dead (expired or
// the browser unsubscribed) so the caller can clean them up.
export async function sendMissionPing(subscriptions) {
  const dead = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          JSON.stringify({
            title: "Beat The Board",
            body: "You've got a new secret mission 👀",
          })
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
