// Minimal service worker whose only job is showing "you've got a mission"
// push alerts and taking a tap on one to the missions page. It never shows
// the mission text itself — that only appears after signing in and hitting
// "My Eyes Only" on /missions, so a locked phone's notification banner never
// gives the secret away.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Beat The Board", body: "You've got a new secret mission 👀" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // Non-JSON push payload — fall back to the generic message above.
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-1.png",
      badge: "/icons/icon-1.png",
      tag: "beat-the-board-mission",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((c) => c.url.includes("/missions"));
      if (existing) {
        existing.focus();
        return;
      }
      const anyClient = clientsList[0];
      if (anyClient) {
        anyClient.navigate("/missions");
        anyClient.focus();
        return;
      }
      self.clients.openWindow("/missions");
    })()
  );
});
