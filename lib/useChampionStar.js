"use client";

import { useEffect, useState } from "react";
import { STAR_IDS } from "./stars";

// Which star design is currently showing behind the #1 spot, and when to
// change it. Sam wants the star itself to feel like it's "handed over" to
// whoever's on top — so instead of always showing the same art, this picks
// a random design from lib/stars.js and only swaps it out when the leader
// actually changes (not on every re-render/refresh while the same person
// stays in first). The choice is remembered in localStorage per device so
// it doesn't flicker between different designs on every page load.
const STORAGE_KEY = "beatTheBoard.championStar";

export function useChampionStar(leaderId) {
  const [starId, setStarId] = useState(STAR_IDS[0]);

  useEffect(() => {
    if (!leaderId) return;

    let stored = null;
    try {
      stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      stored = null;
    }

    if (stored && stored.leaderId === leaderId && STAR_IDS.includes(stored.starId)) {
      setStarId(stored.starId);
      return;
    }

    // New champion (or first load on this device) — pick a design, steering
    // away from whatever was showing before so the swap is noticeable even
    // with just a couple of designs to choose from.
    const previous = stored?.starId;
    const choices = STAR_IDS.length > 1 ? STAR_IDS.filter((id) => id !== previous) : STAR_IDS;
    const next = choices[Math.floor(Math.random() * choices.length)];

    setStarId(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ leaderId, starId: next }));
    } catch {
      // Private browsing etc — worst case it re-rolls next load instead of
      // remembering. Not worth failing over.
    }
  }, [leaderId]);

  return starId;
}
