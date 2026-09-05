"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { useEventCelebration } from "../../lib/useEventCelebration";
import { supabase } from "../../lib/supabaseClient";
import BottomNav from "../../components/BottomNav";
import NotificationBell from "../../components/NotificationBell";
import EventCelebration from "../../components/EventCelebration";
import PlayerAvatar from "../../components/PlayerAvatar";

export default function HotPotatoPage() {
  const router = useRouter();
  const {
    configured,
    loading,
    session,
    me,
    players,
    tripPlayers,
    currentTrip,
    isAdmin,
    trophies,
    startHotPotato,
    passHotPotato,
  } = useBoardData();

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players);

  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [passOpen, setPassOpen] = useState(false);
  const [passTo, setPassTo] = useState(null);
  const [passNote, setPassNote] = useState("");
  const [passing, setPassing] = useState(false);
  const [passError, setPassError] = useState("");

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  useEffect(() => {
    if (!supabase || !currentTrip) return;
    let cancelled = false;

    function load() {
      supabase
        .from("hot_potato_state")
        .select("trip_id, holder_id, note, started_at, last_passed_at")
        .eq("trip_id", currentTrip.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setState(data || null);
        });
    }
    load();

    const channel = supabase
      .channel(`hot-potato-state-${currentTrip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hot_potato_state", filter: `trip_id=eq.${currentTrip.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentTrip]);

  // Full pass history is only shown to the admin, so non-admins never learn
  // who's currently holding it (or who has, in the past) — just whether the
  // game is live and, if it's landed on them, that it's landed on them.
  useEffect(() => {
    if (!supabase || !currentTrip || !isAdmin) {
      setHistory([]);
      return;
    }
    let cancelled = false;

    function load() {
      supabase
        .from("hot_potato_history")
        .select("id, from_player_id, to_player_id, note, created_at")
        .eq("trip_id", currentTrip.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (!cancelled && data) setHistory(data);
        });
    }
    load();

    const channel = supabase
      .channel(`hot-potato-history-${currentTrip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hot_potato_history", filter: `trip_id=eq.${currentTrip.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentTrip, isAdmin]);

  if (!configured || loading || !session) {
    return (
      <div className="wrap">
        <div className="card header-card">
          <div className="subtitle">Loading&hellip;</div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="wrap">
        <div className="card">
          <h2>No profile yet</h2>
          <p className="muted">
            Your account isn&#39;t linked to a player on the board yet — ask whoever runs it to
            add you from the Players panel.
          </p>
        </div>
      </div>
    );
  }

  const enabled = !!currentTrip?.hot_potato_enabled;
  const isHolder = !!state?.holder_id && state.holder_id === me.id;

  async function handleStart() {
    setStartError("");
    setStarting(true);
    const result = await startHotPotato();
    setStarting(false);
    if (!result?.ok) setStartError("Couldn't start it — try again.");
  }

  async function handlePass() {
    if (!passTo) return;
    setPassError("");
    setPassing(true);
    const result = await passHotPotato({ toPlayerId: passTo, note: passNote.trim() });
    setPassing(false);
    if (result?.ok) {
      setPassOpen(false);
      setPassTo(null);
      setPassNote("");
    } else {
      setPassError("Couldn't save that — try again.");
    }
  }

  return (
    <div className="wrap">
      <NotificationBell me={me} />
      {celebrating && (
        <EventCelebration
          trophy={celebrating.trophy}
          winner={celebrating.winner}
          onDismiss={dismiss}
        />
      )}

      <div className="card header-card">
        <h1 style={{ fontSize: 26 }}>🌈 Gay Card</h1>
      </div>

      <div className="card hot-potato-card-face" style={{ marginTop: 16 }}>
        <div className="hot-potato-rainbow" />
        <div className="hot-potato-emoji">🌈</div>
        <div className="hot-potato-card-label">Top Secret</div>
      </div>

      {!enabled && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ textAlign: "center" }}>
            Gay Card isn&#39;t switched on for this event.
          </p>
        </div>
      )}

      {enabled && !state?.holder_id && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          {isAdmin ? (
            <>
              <p className="muted" style={{ marginBottom: 10 }}>
                The game hasn&#39;t started yet — trigger it whenever you&#39;re ready.
              </p>
              <button className="btn btn-primary" disabled={starting} onClick={handleStart}>
                {starting ? "Starting…" : "Start Gay Card"}
              </button>
              {startError && <div className="banner-note error">{startError}</div>}
            </>
          ) : (
            <p className="muted">Waiting for the game to start…</p>
          )}
        </div>
      )}

      {enabled && state?.holder_id && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          {isHolder ? (
            <>
              <p
                style={{
                  fontFamily: "'Striker', 'Archivo', sans-serif",
                  fontSize: 20,
                  color: "var(--acid)",
                  textTransform: "uppercase",
                }}
              >
                You&#39;ve got the Gay Card!
              </p>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Sneak it onto someone else&#39;s person (or something they&#39;re carrying with
                them) without them noticing, then confirm it below. The suitcase under the bed
                doesn&#39;t count!
              </p>

              {!passOpen ? (
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setPassOpen(true)}>
                  I&#39;ve passed it on
                </button>
              ) : (
                <div className="points-composer" style={{ textAlign: "left", marginTop: 12 }}>
                  <label>Who did you pass it to?</label>
                  <div className="chips" style={{ marginTop: 6 }}>
                    {tripPlayers
                      .filter((p) => p.id !== me.id)
                      .map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          className={`chip${passTo === p.id ? " selected" : ""}`}
                          onClick={() => setPassTo(p.id)}
                        >
                          <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={16} />
                          {p.name}
                        </button>
                      ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Where'd you hide it? e.g. their swim bag"
                    maxLength={140}
                    value={passNote}
                    onChange={(e) => setPassNote(e.target.value)}
                    style={{ marginTop: 10 }}
                  />
                  <div className="btn-row">
                    <button className="btn btn-primary" disabled={passing || !passTo} onClick={handlePass}>
                      {passing ? "Saving…" : "Confirm pass"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setPassOpen(false);
                        setPassTo(null);
                        setPassNote("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {passError && <div className="banner-note error">{passError}</div>}
                </div>
              )}
            </>
          ) : (
            <p className="muted">🤐 The card&#39;s in play — you&#39;ll know if it lands on you.</p>
          )}
        </div>
      )}

      {isAdmin && enabled && state?.holder_id && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Admin view</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Currently with <strong>{players.find((p) => p.id === state.holder_id)?.name || "—"}</strong>
            {state.note && <> — &quot;{state.note}&quot;</>}
          </p>
          {history.length > 0 && (
            <div className="mission-list notif-list" style={{ marginTop: 10 }}>
              {history.map((h) => (
                <div className="mission-item" key={h.id}>
                  <div className="mission-date">
                    {new Date(h.created_at).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="mission-text">
                    {players.find((p) => p.id === h.from_player_id)?.name || "Game start"} →{" "}
                    {players.find((p) => p.id === h.to_player_id)?.name || "?"}
                    {h.note && ` (${h.note})`}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Whoever&#39;s holding it when the event ends loses 10 points — unless that would drop
            them past 2nd place, in which case they just drop to 2nd.
          </p>
        </div>
      )}

      <BottomNav session={session} me={me} hotPotatoEnabled={enabled} />
    </div>
  );
}
