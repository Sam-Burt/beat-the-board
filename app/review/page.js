"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { totals } from "../../lib/points";
import { supabase } from "../../lib/supabaseClient";
import PlayerAvatar from "../../components/PlayerAvatar";
import BottomNav from "../../components/BottomNav";

const CATEGORY_LABELS = {
  cards: "Cards",
  board_games: "Board Games",
  sports: "Sports",
  weird_bullshit: "Weird Bullshit Challenges",
};

// Tallies how many times each id in a group of winner/loser arrays shows
// up, then returns whoever's tied for the top count — same "could be more
// than one name" shape every achievement card below uses, since a family
// this size ties on this stuff constantly.
function leaders(counts, players) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return { top: 0, names: [] };
  const top = Math.max(...entries.map(([, n]) => n));
  const names = entries
    .filter(([, n]) => n === top)
    .map(([id]) => players.find((p) => p.id === id))
    .filter(Boolean);
  return { top, names };
}

function AchievementCard({ emoji, title, unit, leaders: { top, names } }) {
  return (
    <div className="review-achievement">
      <div className="review-achievement-emoji" aria-hidden="true">
        {emoji}
      </div>
      <div className="review-achievement-body">
        <h3>{title}</h3>
        {names.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Nobody. Not one.</p>
        ) : (
          <>
            <div className="review-achievement-names">
              {names.map((p) => (
                <span className="review-achievement-name" key={p.id}>
                  <PlayerAvatar iconId={p.iconId ?? p.icon_id} emoji={p.emoji} size={22} />
                  {p.name}
                </span>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {top} {unit}
              {top === 1 ? "" : "s"}
              {names.length > 1 ? " each — tied, obviously" : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// The persistent "how did that just go" page — reachable from the board
// once an event's finalized (see the link in app/page.js), same gating as
// /missions-review. Folds together three things that all used to be
// invisible or scattered: the Gay Card's secret tally (now revealed, same
// moment its point deductions land — see lib/tripFinalize.js), and a set
// of achievements computed fresh from this trip's events/missions.
export default function ReviewPage() {
  const router = useRouter();
  const { configured, loading, session, me, tripPlayers, players, events, adjustments, currentTrip } =
    useBoardData();

  const [gayCardHistory, setGayCardHistory] = useState([]);
  const [completedMissions, setCompletedMissions] = useState([]);
  const [extraLoading, setExtraLoading] = useState(true);

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  useEffect(() => {
    if (!supabase || !currentTrip) return;
    let cancelled = false;
    setExtraLoading(true);
    Promise.all([
      currentTrip.hot_potato_enabled
        ? supabase
            .from("hot_potato_history")
            .select("to_player_id, self_caught")
            .eq("trip_id", currentTrip.id)
            .not("from_player_id", "is", null)
        : Promise.resolve({ data: [] }),
      supabase
        .from("missions")
        .select("player_id")
        .eq("trip_id", currentTrip.id)
        .eq("status", "completed"),
    ]).then(([gayCardRes, missionsRes]) => {
      if (cancelled) return;
      setGayCardHistory(gayCardRes.data || []);
      setCompletedMissions(missionsRes.data || []);
      setExtraLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentTrip]);

  if (!configured || loading || !session) {
    return (
      <div className="wrap">
        <div className="card header-card">
          <div className="subtitle">Loading&hellip;</div>
        </div>
      </div>
    );
  }

  if (!currentTrip || currentTrip.status !== "finalized") {
    return (
      <div className="wrap">
        <div className="card">
          <h2>Nothing to review</h2>
          <p className="muted">No finished event yet. Come back when someone&#39;s actually lost.</p>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => router.push("/")}>
              Back to board
            </button>
          </div>
        </div>
      </div>
    );
  }

  const standings = totals(tripPlayers, events, adjustments);

  // Gay Card: every row here already cost its receiver 2 points, folded
  // into `adjustments` as a single lump deduction when the trip finalized
  // (lib/tripFinalize.js) — this is just the itemized version of that same
  // tally, so people can see how it actually happened rather than one
  // opaque "-8" line in History.
  const gayCardTally = {};
  gayCardHistory.forEach((row) => {
    gayCardTally[row.to_player_id] = (gayCardTally[row.to_player_id] || 0) + 1;
  });
  const gayCardRows = Object.entries(gayCardTally)
    .map(([playerId, count]) => ({
      player: players.find((p) => p.id === playerId),
      count,
      lost: count * 2,
    }))
    .filter((r) => r.player)
    .sort((a, b) => b.count - a.count);

  // Missions: count of status='completed' rows per player.
  const missionCounts = {};
  completedMissions.forEach((m) => {
    missionCounts[m.player_id] = (missionCounts[m.player_id] || 0) + 1;
  });

  // Wins / last places: derived straight from each event's placement
  // groups — ranking[0] is whoever won that round (a tie counts for all of
  // them), ranking[last] is whoever came last the same way.
  const winCounts = {};
  const lastCounts = {};
  const categoryWinCounts = { cards: {}, board_games: {}, sports: {}, weird_bullshit: {} };
  events.forEach((ev) => {
    const groups = ev.ranking || [];
    if (groups.length === 0) return;
    groups[0].forEach((id) => {
      winCounts[id] = (winCounts[id] || 0) + 1;
      if (ev.category && categoryWinCounts[ev.category]) {
        categoryWinCounts[ev.category][id] = (categoryWinCounts[ev.category][id] || 0) + 1;
      }
    });
    groups[groups.length - 1].forEach((id) => {
      lastCounts[id] = (lastCounts[id] || 0) + 1;
    });
  });

  const rosterForAchievements = standings; // has {id, name, emoji, iconId}

  return (
    <div className="wrap">
      <div className="card header-card">
        <h1 style={{ fontSize: 22 }}>Event Review</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{currentTrip.name}</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Final Standings</h2>
        </div>
        {standings.map((s, i) => (
          <div className="review-standing-row" key={s.id}>
            <span className="review-standing-rank">{i + 1}.</span>
            <PlayerAvatar iconId={s.iconId} emoji={s.emoji} size={24} />
            <span style={{ flex: 1 }}>{s.name}</span>
            <span className="review-standing-points">
              {s.points} pt{Math.abs(s.points) === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>

      {currentTrip.hot_potato_enabled && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h2>Gay Card</h2>
          </div>
          {extraLoading ? (
            <p className="muted" style={{ fontSize: 13 }}>Loading&hellip;</p>
          ) : gayCardRows.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Never once got caught out. Suspiciously smooth event.
            </p>
          ) : (
            <>
              {gayCardRows.map((r) => (
                <div className="review-standing-row" key={r.player.id}>
                  <PlayerAvatar iconId={r.player.icon_id} emoji={r.player.emoji} size={24} />
                  <span style={{ flex: 1 }}>{r.player.name}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    caught {r.count} time{r.count === 1 ? "" : "s"}
                  </span>
                  <span className="review-standing-points" style={{ color: "var(--danger)" }}>
                    -{r.lost}
                  </span>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                Every one of those was a secret at the time — this is the first anyone&#39;s
                seeing the full tally, same moment it hit the final score.
              </p>
            </>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Achievements</h2>
        </div>
        {extraLoading ? (
          <p className="muted" style={{ fontSize: 13 }}>Loading&hellip;</p>
        ) : (
          <div className="review-achievements">
            <AchievementCard
              emoji="🏆"
              title="Most Games Won"
              unit="win"
              leaders={leaders(winCounts, rosterForAchievements)}
            />
            <AchievementCard
              emoji="🪦"
              title="Most Last Places"
              unit="last place"
              leaders={leaders(lastCounts, rosterForAchievements)}
            />
            <AchievementCard
              emoji="🕵️"
              title="Secret Agent of the Event"
              unit="mission completed"
              leaders={leaders(missionCounts, rosterForAchievements)}
            />
            {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
              <AchievementCard
                key={id}
                emoji="🎯"
                title={`Best at ${label}`}
                unit="win"
                leaders={leaders(categoryWinCounts[id], rosterForAchievements)}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
