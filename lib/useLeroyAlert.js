"use client";

import { useEffect, useState } from "react";

// Same one-time-per-PLAYER shape as useEventCelebration — keyed on `me.id`
// rather than the device, remembering the last leroy_sends id we've
// already shown the guessing popup for. Leroy is silent right up until he
// strikes (see app/api/leroy/reveal), so this only ever fires once a send
// has actually resolved AND is still inside its 60-second guess window —
// there's nothing to show before that, and nothing worth showing once the
// window's closed (see app/tricks/page.js for the "you never find out"
// aftermath instead).
const STORAGE_KEY = "beatTheBoard.lastSeenLeroyGuessId";

export function useLeroyAlert(leroySends, players, me) {
  const [alerting, setAlerting] = useState(null); // { leroy } | null
  const storageKey = `${STORAGE_KEY}.${me?.id || "anon"}`;

  useEffect(() => {
    if (!me) return;
    const now = new Date();
    const mine = (leroySends || [])
      .filter(
        (l) =>
          l.target_id === me.id &&
          l.resolved_at &&
          !l.guessed_at &&
          l.guess_deadline &&
          new Date(l.guess_deadline) > now
      )
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));
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

    setAlerting({ leroy: latest });
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
