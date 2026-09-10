"use client";

import { useEffect, useState } from "react";

// Same one-time-per-PLAYER shape as useEventCelebration — keyed on `me.id`
// rather than the device, and remembering the last leroy_sends id we've
// already shown a popup for (not just "seen anything ever"), so a second
// send later in the same event still pops fresh. If two sends land on the
// same player before they open the app, only the most recent one gets a
// popup — an acceptable gap for how rarely that'll actually happen.
const STORAGE_KEY = "beatTheBoard.lastSeenLeroySendId";

export function useLeroyAlert(leroySends, players, me) {
  const [alerting, setAlerting] = useState(null); // { leroy, sender } | null
  const storageKey = `${STORAGE_KEY}.${me?.id || "anon"}`;

  useEffect(() => {
    if (!me) return;
    const mine = (leroySends || [])
      .filter((l) => l.target_id === me.id)
      .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    const latest = mine[0];
    if (!latest) return;

    let lastSeen = null;
    try {
      lastSeen = window.localStorage.getItem(storageKey);
    } catch {
      // Private browsing / storage blocked — fine, we just won't remember
      // across reloads, the popup still shows this time.
    }
    if (lastSeen === latest.id) return;

    const sender = (players || []).find((p) => p.id === latest.sender_id) || null;
    setAlerting({ leroy: latest, sender });
  }, [leroySends, players, me, storageKey]);

  function dismiss() {
    if (alerting) {
      try {
        window.localStorage.setItem(storageKey, alerting.leroy.id);
      } catch {
        // ignore — worst case it shows again next reload
      }
    }
    setAlerting(null);
  }

  return { alerting, dismiss };
}
