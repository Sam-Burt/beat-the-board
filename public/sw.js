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
  // "url" says where a tap on the notification should land — missions and
  // hot-potato passes each point at their own tab. Defaults kept here only
  // as a last resort if a push ever arrives with no payload at all.
  let payload = { title: "🤫 Shhh…", body: "You've got a secret mission 👀", url: "/missions" };
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
      tag: payload.tag || "beat-the-board-mission",
      data: { url: payload.url || "/missions" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data?.url || "/missions";
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((c) => c.url.includes(url));
      if (existing) {
        existing.focus();
        return;
      }
      const anyClient = clientsList[0];
      if (anyClient) {
        anyClient.navigate(url);
        anyClient.focus();
        return;
      }
      self.clients.openWindow(url);
    })()
  );
});
