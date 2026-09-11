"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { totals, eventPoints } from "../../lib/points";
import { supabase } from "../../lib/supabaseClient";
import PlayerAvatar from "../../components/PlayerAvatar";
import BottomNav from "../../components/BottomNav";

const CATEGORY_LABELS = {
  cards: "Cards",
  board_games: "Board Games",
  sports: "Sports",
  weird_bullshit: "Weird Bullshit Challenges",
};

function fmtPts(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function countCaption(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural || `${singular}s`}`;
}

// Tallies how many times each id in a counts map shows up, then returns
// whoever's tied for the top count — every achievement below uses this
// same "could be more than one name" shape, since a family this size ties
// on this stuff constantly.
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

// Compact inline form for the Secret Missions summary lines — just names
// and a count, no avatars, since it sits inline with a sentence rather
// than as its own card.
function leaderLabel(counts, players) {
  const { top, names } = leaders(counts, players);
  if (names.length === 0) return "Nobody";
  return `${names.map((p) => p.name).join(" & ")} (${top})`;
}

function AchievementCard({ emoji, title, caption, leaders: { names } }) {
  return (
    <div className="review-achievement">
      <div className="review-achievement-emoji" aria-hidden="true">
        {emoji}
      </div>
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
            {caption}
            {names.length > 1 ? " each — tied, obviously" : ""}
          </p>
        </>
      )}
    </div>
  );
}

// The persistent "how did that just go" page — reachable from the board
// once an event's finalized (see the link in app/page.js), same gating as
// /missions-review. Folds together everything that used to be invisible
// or scattered across other pages: the Gay Card's secret tally, secret
// mission outcomes, and a full set of achievements computed fresh from
// this trip's events/missions/tricks.
export default function ReviewPage() {
  const router = useRouter();
  const { configured, loading, session, me, tripPlayers, players, events, adjustments, leroySends, currentTrip } =
    useBoardData();

  const [gayCardHistory, setGayCardHistory] = useState([]);
  const [allMissions, setAllMissions] = useState([]);
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
      supabase.from("missions").select("player_id, status").eq("trip_id", currentTrip.id),
    ]).then(([gayCardRes, missionsRes]) => {
      if (cancelled) return;
      setGayCardHistory(gayCardRes.data || []);
      setAllMissions(missionsRes.data || []);
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
          <h2 style={{ textAlign: "center" }}>Nothing to review</h2>
          <p className="muted" style={{ textAlign: "center" }}>
            No finished event yet. Come back when someone&#39;s actually lost.
          </p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => router.push("/")}>
              Back to board
            </button>
          </div>
        </div>
      </div>
    );
  }

  const standings = totals(tripPlayers, events, adjustments);
  const rosterForAchievements = standings; // has {id, name, emoji, iconId, roundsPlayed}

  // Gay Card: every row here already cost its receiver 2 points, folded
  // into `adjustments` as a single lump deduction when the trip finalized
  // (lib/tripFinalize.js) — this is just the itemized version of that same
  // tally, so people can see how it actually happened rather than one
  // opaque "-8" line in History.
  const gayCardTally = {};
  const selfCaughtCounts = {};
  gayCardHistory.forEach((row) => {
    gayCardTally[row.to_player_id] = (gayCardTally[row.to_player_id] || 0) + 1;
    if (row.self_caught) selfCaughtCounts[row.to_player_id] = (selfCaughtCounts[row.to_player_id] || 0) + 1;
  });
  const gayCardRows = Object.entries(gayCardTally)
    .map(([playerId, count]) => ({
      player: players.find((p) => p.id === playerId),
      count,
      lost: count * 2,
    }))
    .filter((r) => r.player)
    .sort((a, b) => b.count - a.count);

  // Missions: split into completed / declined / ignored (still 'pending'
  // now the event's over, so that's as good as ignored) per player.
  const missionStatusCounts = {};
  allMissions.forEach((m) => {
    const c = (missionStatusCounts[m.player_id] ||= { completed: 0, declined: 0, pending: 0 });
    c[m.status] = (c[m.status] || 0) + 1;
  });
  const missionCompletedCounts = {};
  const missionDeclinedCounts = {};
  const missionIgnoredCounts = {};
  Object.entries(missionStatusCounts).forEach(([id, c]) => {
    missionCompletedCounts[id] = c.completed;
    missionDeclinedCounts[id] = c.declined;
    missionIgnoredCounts[id] = c.pending;
  });
  const missionRows = Object.entries(missionStatusCounts)
    .map(([playerId, c]) => ({ player: players.find((p) => p.id === playerId), ...c }))
    .filter((r) => r.player)
    .sort((a, b) => b.completed - a.completed);

  // Wins / last places / best single day / best category — all derived
  // straight from each event's placement groups. ranking[0] is whoever
  // won that round (a tie counts for all of them), ranking[last] is
  // whoever came last the same way. "Best single day" only counts round
  // scoring, not point_adjustments — those aren't tied to a specific day
  // of play.
  const winCounts = {};
  const lastCounts = {};
  const categoryWinCounts = { cards: {}, board_games: {}, sports: {}, weird_bullshit: {} };
  const dailyTotals = {};
  events.forEach((ev) => {
    const groups = ev.ranking || [];
    if (groups.length > 0) {
      groups[0].forEach((id) => {
        winCounts[id] = (winCounts[id] || 0) + 1;
        if (ev.category && categoryWinCounts[ev.category]) {
          categoryWinCounts[ev.category][id] = (categoryWinCounts[ev.category][id] || 0) + 1;
        }
      });
      groups[groups.length - 1].forEach((id) => {
        lastCounts[id] = (lastCounts[id] || 0) + 1;
      });
    }
    const pts = eventPoints(ev);
    Object.entries(pts).forEach(([playerId, value]) => {
      (dailyTotals[playerId] ||= {})[ev.date] = (dailyTotals[playerId][ev.date] || 0) + value;
    });
  });
  const bestDayCounts = {};
  Object.entries(dailyTotals).forEach(([playerId, days]) => {
    bestDayCounts[playerId] = Math.max(...Object.values(days));
  });

  // Leroy: how many times each player was actually struck (regardless of
  // whether they later caught the sender) — a send that never resolved
  // doesn't count since nothing happened to them yet. More than one
  // sender can target the same player in one event, so this isn't
  // necessarily 0 or 1.
  const leroyMuggedCounts = {};
  leroySends.forEach((l) => {
    if (l.resolved_at) leroyMuggedCounts[l.target_id] = (leroyMuggedCounts[l.target_id] || 0) + 1;
  });

  // Games completed — every round played, win or lose.
  const roundsPlayedCounts = {};
  standings.forEach((s) => {
    roundsPlayedCounts[s.id] = s.roundsPlayed;
  });

  return (
    <div className="wrap review-page">
      <div className="card header-card">
        <h1 style={{ fontSize: 22 }}>Event Review</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{currentTrip.name}</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ textAlign: "center" }}>Final Standings</h2>
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
          <h2 style={{ textAlign: "center" }}>Gay Card</h2>
          {extraLoading ? (
            <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>Loading&hellip;</p>
          ) : gayCardRows.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
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
              <p className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: "center" }}>
                Every one of those was a secret at the time — this is the first anyone&#39;s
                seeing the full tally, same moment it hit the final score.
              </p>
            </>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ textAlign: "center" }}>Secret Missions</h2>
        {extraLoading ? (
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>Loading&hellip;</p>
        ) : allMissions.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
            Nobody got sent a single one. Dead event.
          </p>
        ) : (
          <>
            <div className="review-mission-summary">
              <div>🕵️ Most completed: {leaderLabel(missionCompletedCounts, rosterForAchievements)}</div>
              <div>🙈 Most ignored: {leaderLabel(missionIgnoredCounts, rosterForAchievements)}</div>
              <div>🙅 Most declined: {leaderLabel(missionDeclinedCounts, rosterForAchievements)}</div>
            </div>
            {missionRows.map((r) => (
              <div className="review-standing-row" key={r.player.id}>
                <PlayerAvatar iconId={r.player.icon_id} emoji={r.player.emoji} size={24} />
                <span style={{ flex: 1 }}>{r.player.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {r.completed} done · {r.declined} declined · {r.pending} ignored
                </span>
              </div>
            ))}
          </>
        )}
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 14 }}>
          <Link href="/missions-review" className="btn btn-signout" style={{ textTransform: "uppercase" }}>
            See all secret missions
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ textAlign: "center" }}>Achievements</h2>
        {extraLoading ? (
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>Loading&hellip;</p>
        ) : (
          <div className="review-achievements">
            <AchievementCard
              emoji="🏆"
              title="Most Games Won"
              caption={countCaption(leaders(winCounts, rosterForAchievements).top, "win")}
              leaders={leaders(winCounts, rosterForAchievements)}
            />
            <AchievementCard
              emoji="🎮"
              title="Most Games Completed"
              caption={countCaption(leaders(roundsPlayedCounts, rosterForAchievements).top, "game played", "games played")}
              leaders={leaders(roundsPlayedCounts, rosterForAchievements)}
            />
            <AchievementCard
              emoji="🪦"
              title="Most Last Places"
              caption={countCaption(leaders(lastCounts, rosterForAchievements).top, "last place")}
              leaders={leaders(lastCounts, rosterForAchievements)}
            />
            <AchievementCard
              emoji="💥"
              title="Best Single Day"
              caption={`${fmtPts(leaders(bestDayCounts, rosterForAchievements).top)} pts in one day`}
              leaders={leaders(bestDayCounts, rosterForAchievements)}
            />
            <AchievementCard
              emoji="🥷"
              title="Mugged By Leroy The Most"
              caption={countCaption(leaders(leroyMuggedCounts, rosterForAchievements).top, "time")}
              leaders={leaders(leroyMuggedCounts, rosterForAchievements)}
            />
            {currentTrip.hot_potato_enabled && (
              <AchievementCard
                emoji="🫣"
                title="Failed To Pass The Gay Card The Most"
                caption={countCaption(leaders(selfCaughtCounts, rosterForAchievements).top, "time")}
                leaders={leaders(selfCaughtCounts, rosterForAchievements)}
              />
            )}
            {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
              <AchievementCard
                key={id}
                emoji="🎯"
                title={`Best at ${label}`}
                caption={countCaption(leaders(categoryWinCounts[id], rosterForAchievements).top, "win")}
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
