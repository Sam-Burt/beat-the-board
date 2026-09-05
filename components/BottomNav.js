"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

// A fixed app-style tab bar, shown only to a signed-in player who has a
// profile to navigate to (me). Kept as a separate component (rather than
// living in Footer) so every page that needs it just renders <BottomNav />
// with the session/me it already has from useBoardData — no extra fetching.
// The Gay Card tab only shows up when the current event has that game
// switched on (see TripPanel's "Edit event"/"Start event" toggle).
export default function BottomNav({ session, me, hotPotatoEnabled }) {
  const pathname = usePathname();

  if (!session || !me) return null;

  const tabs = hotPotatoEnabled ? [TABS[0], TABS[1], HOT_POTATO_TAB, TABS[2]] : TABS;

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
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
