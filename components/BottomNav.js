"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const TABS = [
  {
    href: "/",
    label: "Board",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19V10M10 19V5M16 19V13M22 19H2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/missions",
    label: "Missions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// UI-facing name is "Gay Card" (Sam's family in-joke — "gay" as in
// "happy/daydreamy"); the route, prop name, and every other internal
// identifier stays "hot potato" for the same reason "trip" stays "trip" in
// code while the UI says "Event" — see the project doc.
const HOT_POTATO_TAB = {
  href: "/hot-potato",
  label: "Gay Card",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="3" width="16" height="18" rx="2" strokeLinejoin="round" />
      <path d="M12 8l3 4-3 4-3-4 3-4Z" strokeLinejoin="round" />
    </svg>
  ),
};

// Always available (not tied to a per-event toggle, unlike Gay Card) —
// every player gets exactly one send per event, so this tab is where
// they use it and where they can see if Leroy's currently on their tail.
const LEROY_TAB = {
  href: "/leroy",
  label: "Leroy",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M12 3c-3 0-5 2-5 5v3c0 3.5 2.3 6 5 6s5-2.5 5-6V8c0-3-2-5-5-5Z"
        strokeLinejoin="round"
      />
      <path d="M9 11.5c0 .8.6 1.5 1.3 1.5" strokeLinecap="round" />
      <path d="M14.7 11.5c0 .8-.6 1.5-1.3 1.5" strokeLinecap="round" />
      <path d="M8 9h3M13 9h3" strokeLinecap="round" />
    </svg>
  ),
};

// A fixed app-style tab bar, shown only to a signed-in player who has a
// profile to navigate to (me). Kept as a separate component (rather than
// living in Footer) so every page that needs it just renders <BottomNav />
// with the session/me it already has from useBoardData — no extra fetching.
// The Gay Card tab only shows up when the current event has that game
// switched on (see TripPanel's "Edit event"/"Start event" toggle).
export default function BottomNav({ session, me, hotPotatoEnabled }) {
  const pathname = usePathname();
  const [unreadKinds, setUnreadKinds] = useState(new Set());

  // Drives the pink dot on Missions/Gay Card — same notifications table
  // NotificationBell reads on the Profile tab, just grouped by kind here
  // instead of shown as a list, so every tab reflects unread state at a
  // glance without having to open the bell.
  useEffect(() => {
    if (!supabase || !me) {
      setUnreadKinds(new Set());
      return;
    }
    let cancelled = false;

    function load() {
      supabase
        .from("notifications")
        .select("kind")
        .eq("player_id", me.id)
        .is("read_at", null)
        .then(({ data }) => {
          if (!cancelled) setUnreadKinds(new Set((data || []).map((n) => n.kind)));
        });
    }
    load();

    const channel = supabase
      .channel(`bottom-nav-unread-${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `player_id=eq.${me.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [me]);

  if (!session || !me) return null;

  const tabs = hotPotatoEnabled
    ? [TABS[0], TABS[1], LEROY_TAB, HOT_POTATO_TAB, TABS[2]]
    : [TABS[0], TABS[1], LEROY_TAB, TABS[2]];
  const dotFor = {
    "/missions": unreadKinds.has("mission"),
    "/hot-potato": unreadKinds.has("hot_potato"),
    "/leroy": unreadKinds.has("leroy"),
  };

  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav-inner">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`bottom-nav-tab${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="bottom-nav-icon-wrap">
                {tab.icon}
                {dotFor[tab.href] && <span className="bottom-nav-dot" aria-hidden="true" />}
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
