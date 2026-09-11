"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { useEventCelebration } from "../../lib/useEventCelebration";
import { useLeroyAlert } from "../../lib/useLeroyAlert";
import { supabase } from "../../lib/supabaseClient";
import BottomNav from "../../components/BottomNav";
import EventCelebration from "../../components/EventCelebration";
import LeroyAlert from "../../components/LeroyAlert";
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
    leroySends,
    guessLeroy,
    startHotPotato,
    passHotPotato,
  } = useBoardData();

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players, me);
  const { alerting: leroyAlert, dismiss: dismissLeroyAlert } = useLeroyAlert(leroySends, players, me);

  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [receivedInfo, setReceivedInfo] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Closed by default, every time — the admin here (Sam) is also a
  // player, so seeing who currently holds it by default would spoil the
  // game for them. It's still one tap away for resolving a dispute (card
  // lost, foul play, etc.), just never shown automatically.
  const [adminViewOpen, setAdminViewOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [startPushInfo, setStartPushInfo] = useState("");
  const [passOpen, setPassOpen] = useState(false);
  const [passTo, setPassTo] = useState(null);
  const [passNote, setPassNote] = useState("");
  const [passing, setPassing] = useState(false);
  const [passError, setPassError] = useState("");
  const [passPushInfo, setPassPushInfo] = useState("");

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

  // Clears the pink dot BottomNav shows for a pass landing on you — landing
  // on this tab at all counts as "seen", same as opening the notification
  // bell does.
  useEffect(() => {
    if (!supabase || !me) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("player_id", me.id)
      .eq("kind", "hot_potato")
      .is("read_at", null)
      .then(() => {});
  }, [me]);

  // The one piece of history every player IS allowed to see about
  // themselves (not anyone else's): the single most recent time the card
  // landed on them — who passed it (null means dealt at random, game
  // start) and where they said they hid it. RLS already allows reading
  // hot_potato_history at all (see schema.sql); the app just never showed
  // this to non-admins before.
  useEffect(() => {
    if (!supabase || !currentTrip || !me) {
      setReceivedInfo(null);
      return;
    }
    let cancelled = false;

    function load() {
      supabase
        .from("hot_potato_history")
        .select("from_player_id, note, created_at")
        .eq("trip_id", currentTrip.id)
        .eq("to_player_id", me.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setReceivedInfo(data || null);
        });
    }
    load();

    const channel = supabase
      .channel(`hot-potato-received-${currentTrip.id}-${me.id}`)
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
  }, [currentTrip, me]);

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
            You exist, technically, but not on the board. Go and ask whoever runs this to
            add you from the Players panel, and try to sound like you deserve it.
          </p>
        </div>
      </div>
    );
  }

  const enabled = !!currentTrip?.hot_potato_enabled;
  const isHolder = !!state?.holder_id && state.holder_id === me.id;

  // The route already knows exactly how many devices got pushed — worth
  // showing, since "started"/"passed" looks identical whether it actually
  // buzzed someone's phone or quietly went nowhere.
  function describePush(data) {
    if (!data?.pushConfigured) return "";
    if (data.pushed > 0) return `Pinged ${data.pushed} device${data.pushed === 1 ? "" : "s"}.`;
    return "No push went out — they haven't turned on mission alerts, or it's gone stale.";
  }

  async function handleStart() {
    setStartError("");
    setStartPushInfo("");
    setStarting(true);
    const result = await startHotPotato();
    setStarting(false);
    if (!result?.ok) {
      setStartError("Couldn't start it — try again.");
    } else {
      setStartPushInfo(describePush(result.data));
    }
  }

  async function handlePass(e) {
    e?.preventDefault();
    if (!passTo) return;
    setPassError("");
    setPassPushInfo("");
    setPassing(true);
    const result = await passHotPotato({ toPlayerId: passTo, note: passNote.trim() });
    setPassing(false);
    if (result?.ok) {
      setPassOpen(false);
      setPassTo(null);
      setPassNote("");
      setPassPushInfo(describePush(result.data));
    } else {
      setPassError("Couldn't save that — try again.");
    }
  }

  return (
    <div className="wrap">
      {celebrating && (
        <EventCelebration
          trophy={celebrating.trophy}
          winner={celebrating.winner}
          variant={celebrating.variant}
          onDismiss={dismiss}
        />
      )}
      {leroyAlert && (
        <LeroyAlert
          leroy={leroyAlert.leroy}
          tripPlayers={tripPlayers}
          me={me}
          onGuess={guessLeroy}
          onDismiss={dismissLeroyAlert}
        />
      )}

      <div className="card header-card">
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h1 style={{ fontSize: 26 }}>Gay Card</h1>
          <button
            type="button"
            className="card-help-btn"
            onClick={() => setHelpOpen(true)}
            aria-label="What is this?"
          >
            ?
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>What is this?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              One card. One victim, picked at random. If it lands on you, your job is to plant
              it on somebody else — on them, or in something they&#39;re actually carrying about
              — without them noticing, then own up to it here. Shoving it in a suitcase under
              a bed does not count, and everyone knows that&#39;s exactly what you were
              planning.
            </p>
            <h3 style={{ marginTop: 18 }}>What to look out for?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Anyone taking a suspicious interest in your pockets. Whoever&#39;s holding it when
              the event ends drops 10 points. And if you were leading by more than that, you
              don&#39;t just lose the points, you lose the lead — you finish 1 behind whoever
              was second. Do try to enjoy the rest of your day.
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card hot-potato-card-face" style={{ marginTop: 16 }}>
        <div className="hot-potato-rainbow" />
        <div className="hot-potato-emoji">🌈</div>
        <div className="hot-potato-card-label">Top Secret</div>
      </div>

      {!enabled && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ textAlign: "center" }}>
            Not switched on this event. Someone&#39;s gone soft.
          </p>
        </div>
      )}

      {enabled && !state?.holder_id && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          {isAdmin ? (
            <>
              <p className="muted" style={{ marginBottom: 10 }}>
                Not started yet. Ruin someone&#39;s day whenever you&#39;re ready.
              </p>
              <button className="btn btn-primary" disabled={starting} onClick={handleStart}>
                {starting ? "Starting…" : "Start Gay Card"}
              </button>
              {startError && <div className="banner-note error">{startError}</div>}
              {startPushInfo && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {startPushInfo}
                </p>
              )}
            </>
          ) : (
            <p className="muted">Nothing&#39;s happening. Sit there and be patient.</p>
          )}
        </div>
      )}

      {enabled && state?.holder_id && (
        <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
          {isHolder ? (
            <>
              <p className="gay-card-title">You&#39;ve got the Gay Card!</p>
              {receivedInfo && (
                <div className="received-info">
                  {receivedInfo.from_player_id ? (
                    (() => {
                      const fromPlayer = players.find((p) => p.id === receivedInfo.from_player_id);
                      return (
                        <>
                          <div className="received-info-from">
                            <PlayerAvatar iconId={fromPlayer?.icon_id} emoji={fromPlayer?.emoji} size={36} />
                            <span>{fromPlayer?.name || "Someone"}</span>
                          </div>
                          <p className="received-info-passed">has passed this to you</p>
                          {receivedInfo.note && (
                            <>
                              <h3 className="gay-card-title received-info-heading">Where to find it</h3>
                              <p className="received-info-note">{receivedInfo.note}</p>
                            </>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <p className="received-info-passed">Dealt to you at random. The universe has spoken.</p>
                  )}
                </div>
              )}
              <p
                className="muted"
                style={{ fontSize: 13, marginTop: 6, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}
              >
                Plant it on someone else, or in something they&#39;re actually carrying about,
                then confess below.
                <br />
                The suitcase under the bed doesn&#39;t count. Nice try.
              </p>

              {!passOpen ? (
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setPassOpen(true)}>
                  I&#39;ve passed it on
                </button>
              ) : (
                <form className="points-composer" style={{ textAlign: "left", marginTop: 12 }} onSubmit={handlePass}>
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
                          <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
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
                    enterKeyHint="send"
                    style={{ marginTop: 10 }}
                  />
                  <div className="btn-row">
                    <button type="submit" className="btn btn-primary" disabled={passing || !passTo}>
                      {passing ? "Saving…" : "Confirm pass"}
                    </button>
                    <button
                      type="button"
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
                </form>
              )}
            </>
          ) : (
            <>
              <p className="muted">🤐 It&#39;s out there. You&#39;ll find out the hard way.</p>
              {passPushInfo && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {passPushInfo}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {isAdmin && enabled && state?.holder_id && (
        <div className="card" style={{ marginTop: 16 }}>
          <button className="btn toggle-panel-btn" onClick={() => setAdminViewOpen((o) => !o)}>
            <h2>Admin view</h2>
            <span className={`chevron${adminViewOpen ? " open" : ""}`}>▾</span>
          </button>
          {!adminViewOpen ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Hidden by default so playing doesn&#39;t spoil it for you too — tap above if the
              card&#39;s gone missing or something looks off.
            </p>
          ) : (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: 13 }}>
                Currently with{" "}
                <strong>{players.find((p) => p.id === state.holder_id)?.name || "—"}</strong>
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
                Whoever&#39;s holding it when the event ends loses 10 points — unless they&#39;re
                in 1st by more than 10, in which case they lose the lead entirely and end up 1
                point behind whoever was in 2nd.
              </p>
            </div>
          )}
        </div>
      )}

      <BottomNav session={session} me={me} hotPotatoEnabled={enabled} />
    </div>
  );
}
