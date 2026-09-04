"use client";

import { useEffect, useState } from "react";

// Remembers the last trophy we've already shown the "you won!" celebration
// for, per-device, so it doesn't pop up again on every reload once someone's
// seen it — but does pop up fresh the moment a NEW event finalizes with a
// winner, on whichever page/tab happens to be open at the time.
const STORAGE_KEY = "beatTheBoard.lastCelebratedTrophyId";

export function useEventCelebration(trophies, currentTrip, players) {
  const [celebrating, setCelebrating] = useState(null); // { trophy, winner } | null

  useEffect(() => {
    if (!currentTrip || currentTrip.status !== "finalized") return;
    const trophy = (trophies || []).find((t) => t.trip_id === currentTrip.id);
    if (!trophy) return;

    let lastSeen = null;
    try {
      lastSeen = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing / storage blocked — fine, we just won't remember
      // across reloads, the celebration still shows this time.
    }
    if (lastSeen === trophy.id) return;

    const winner = (players || []).find((p) => p.id === trophy.player_id) || null;
    setCelebrating({ trophy, winner });
  }, [trophies, currentTrip, players]);

  function dismiss() {
    if (celebrating) {
      try {
        window.localStorage.setItem(STORAGE_KEY, celebrating.trophy.id);
      } catch {
        // ignore — worst case it shows again next reload, not the end of the world
      }
    }
    setCelebrating(null);
  }

  return { celebrating, dismiss };
}
