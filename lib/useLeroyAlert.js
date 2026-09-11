"use client";

import { useEffect, useRef, useState } from "react";

// Same one-time-per-PLAYER shape as useEventCelebration — keyed on `me.id`
// rather than the device, remembering the last leroy_sends id we've
// already shown the guessing popup for. Leroy is silent right up until he
// strikes (see app/api/leroy/reveal), so this only ever fires once a send
// has actually resolved — there's nothing to show before that, and nothing
// worth showing once the window's closed (see app/tricks/page.js for the
// "you never find out" aftermath instead).
const STORAGE_KEY = "beatTheBoard.lastSeenLeroyGuessId";

// `startGuessWindow` is app/api/leroy/start-guess-window (via
// lib/useBoardData.js) — this hook is what actually decides the moment to
// call it: the first time it notices a struck-but-not-yet-clocked send for
// this player, i.e. right as it's about to show them the popup. That's
// deliberately later than reveal itself, so someone who doesn't open the
// app for ten minutes after their round got logged still gets a fair,
// full 60 seconds once they actually look, instead of the window quietly
// expiring unseen in the background.
export function useLeroyAlert(leroySends, players, me, startGuessWindow) {
  const [alerting, setAlerting] = useState(null); // { leroy } | null
  const storageKey = `${STORAGE_KEY}.${me?.id || "anon"}`;
  const startedRef = useRef(new Set());

  useEffect(() => {
    if (!me) return;
    const now = new Date();
    const mine = (leroySends || [])
      .filter((l) => l.target_id === me.id && l.resolved_at && !l.guessed_at)
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));
    const latest = mine[0];
    if (!latest) {
      setAlerting(null);
      return;
    }

    let lastSeen = null;
    try {
      lastSeen = window.localStorage.getItem(storageKey);
    } catch {
      // Private browsing / storage blocked — fine, we just won't remember
      // across reloads, the popup still shows this time.
    }
    if (lastSeen === latest.id) {
      setAlerting(null);
      return;
    }

    if (!latest.guess_deadline) {
      // Struck, but nobody's clock has started yet — this is that moment.
      // Kick it off once (per id, per mount); the resulting guess_deadline
      // comes back through the normal realtime refresh of leroySends,
      // which re-runs this effect and falls through to the branch below.
      if (startGuessWindow && !startedRef.current.has(latest.id)) {
        startedRef.current.add(latest.id);
        startGuessWindow({ leroySendId: latest.id });
      }
      setAlerting(null);
      return;
    }

    if (new Date(latest.guess_deadline) <= now) {
      // Someone else's window opened and closed without this device ever
      // being open to see it.
      setAlerting(null);
      return;
    }

    setAlerting({ leroy: latest });
  }, [leroySends, players, me, storageKey, startGuessWindow]);

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
