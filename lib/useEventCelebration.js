"use client";

import { useEffect, useState } from "react";

// Remembers the last trophy we've already shown the "you won!" celebration
// for, per PLAYER (not just per-device) — a device gets shared across
// logins (the admin's phone is also, say, the winner's phone once they
// sign in on it), so keying this on the device alone meant whoever
// dismissed it first silently suppressed it for the next person who signed
// in on that same phone, even if they'd never actually seen it. Signed-out
// visitors share one "anon" slot, same one-time-per-device behavior as
// before. Pops up fresh the moment a NEW event finalizes with a winner, on
// whichever page/tab happens to be open at the time.
const STORAGE_KEY = "beatTheBoard.lastCelebratedTrophyId";

export function useEventCelebration(trophies, currentTrip, players, me) {
  const [celebrating, setCelebrating] = useState(null); // { trophy, winner } | null
  const storageKey = `${STORAGE_KEY}.${me?.id || "anon"}`;

  useEffect(() => {
    if (!currentTrip || currentTrip.status !== "finalized") return;
    const trophy = (trophies || []).find((t) => t.trip_id === currentTrip.id);
    if (!trophy) return;

    let lastSeen = null;
    try {
      lastSeen = window.localStorage.getItem(storageKey);
    } catch {
      // Private browsing / storage blocked — fine, we just won't remember
      // across reloads, the celebration still shows this time.
    }
    if (lastSeen === trophy.id) return;

    const winner = (players || []).find((p) => p.id === trophy.player_id) || null;
    setCelebrating({ trophy, winner });
  }, [trophies, currentTrip, players, storageKey]);

  function dismiss() {
    if (celebrating) {
      try {
        window.localStorage.setItem(storageKey, celebrating.trophy.id);
      } catch {
        // ignore — worst case it shows again next reload, not the end of the world
      }
    }
    setCelebrating(null);
  }

  return { celebrating, dismiss };
}
