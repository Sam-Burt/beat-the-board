"use client";

import { useEffect, useState } from "react";

// Remembers the last trophy VERSION we've already shown a celebration for,
// per PLAYER (not just per-device) — a device gets shared across logins
// (the admin's phone is also, say, the winner's phone once they sign in on
// it), so keying this on the device alone meant whoever dismissed it first
// silently suppressed it for the next person who signed in on that same
// phone, even if they'd never actually seen it. Signed-out visitors share
// one "anon" slot, same one-time-per-device behavior as before.
//
// "Version" matters because of VAR (see app/api/admin/revise-score): the
// admin can reassign an already-awarded trophy to someone else after the
// fact. That UPDATEs the same trophy row rather than creating a new one, so
// dismissal can't just key on trophy.id — everyone who already saw and
// dismissed the original "you won!" would silently never see the overturn.
// Keying on id + revised_at means a revision always pops fresh, for
// everyone, even those who dismissed the original announcement.
const STORAGE_KEY = "beatTheBoard.lastCelebratedTrophyVersion";

export function useEventCelebration(trophies, currentTrip, players, me) {
  const [celebrating, setCelebrating] = useState(null); // { trophy, winner, variant } | null
  const storageKey = `${STORAGE_KEY}.${me?.id || "anon"}`;

  useEffect(() => {
    if (!currentTrip || currentTrip.status !== "finalized") return;
    const trophy = (trophies || []).find((t) => t.trip_id === currentTrip.id);
    if (!trophy) return;
    const version = `${trophy.id}:${trophy.revised_at || ""}`;

    let lastSeen = null;
    try {
      lastSeen = window.localStorage.getItem(storageKey);
    } catch {
      // Private browsing / storage blocked — fine, we just won't remember
      // across reloads, the celebration still shows this time.
    }
    if (lastSeen === version) return;

    const winner = (players || []).find((p) => p.id === trophy.player_id) || null;
    setCelebrating({ trophy, winner, version, variant: trophy.revised_at ? "var" : "win" });
  }, [trophies, currentTrip, players, storageKey]);

  function dismiss() {
    if (celebrating) {
      try {
        window.localStorage.setItem(storageKey, celebrating.version);
      } catch {
        // ignore — worst case it shows again next reload, not the end of the world
      }
    }
    setCelebrating(null);
  }

  return { celebrating, dismiss };
}
