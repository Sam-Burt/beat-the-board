"use client";

import { useEffect, useState } from "react";
import { useBoardData } from "../lib/useBoardData";
import { useEventCelebration } from "../lib/useEventCelebration";
import { totals } from "../lib/points";
import Header from "../components/Header";
import Champion from "../components/Champion";
import Board from "../components/Board";
import TripPanel from "../components/TripPanel";
import LogResultForm from "../components/LogResultForm";
import PlayersPanel from "../components/PlayersPanel";
import IconPicker from "../components/IconPicker";
import History from "../components/History";
import Footer from "../components/Footer";
import BottomNav from "../components/BottomNav";
import EventCelebration from "../components/EventCelebration";

export default function HomePage() {
  const {
    configured,
    loading,
    tripName,
    currentTrip,
    players,
    tripPlayers,
    rosterIdSet,
    events,
    adjustments,
    trophies,
    trophyCounts,
    session,
    isAdmin,
    me,
    saveError,
    clearSaveError,
    createPlayerAccount,
    removePlayer,
    sendMission,
    updateMyIcon,
    saveEvent,
    deleteEvent,
    addPointAdjustment,
    updateTripDetails,
    createTrip,
    endTripNow,
    declareTripWinner,
  } = useBoardData();

  // Hooks must run every render regardless of the early returns below, so
  // these live here rather than after the loading/configured checks.
  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players);
  const [showLastResults, setShowLastResults] = useState(false);
  const [tripPanelOpen, setTripPanelOpen] = useState(false);

  // Auto-expand the Event panel once there's no active event to show —
  // covers both the first load and a trip finalizing live while this page
  // is already open, not just the moment TripPanel first mounts.
  useEffect(() => {
    if (loading) return;
    if (!currentTrip || currentTrip.status === "finalized") setTripPanelOpen(true);
  }, [loading, currentTrip?.status, currentTrip?.id]);

  if (!configured) {
    return (
      <div className="wrap">
        <div className="card">
          <h2>Set up needed</h2>
          <p className="muted">
            This app isn&#39;t connected to Supabase yet. Add{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your environment
            variables (see <code>.env.local.example</code> or the README) and
            reload.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="wrap">
        <div className="card header-card">
          <div className="subtitle">Loading&hellip;</div>
        </div>
      </div>
    );
  }

  // Standings are scoped to the current trip's roster and include any
  // manual point adjustments on top of the automatic per-round scoring.
  const standings = totals(tripPlayers, events, adjustments);

  // Once a trip finalizes (or none has ever been started) there's nothing
  // "current" to show — the board, champion star and history all go behind
  // a "View last results" toggle instead of just staying up forever.
  const hasActiveEvent = !!currentTrip && currentTrip.status !== "finalized";
  const showResults = hasActiveEvent || showLastResults;

  function handleStartNewEvent() {
    setTripPanelOpen(true);
    document.getElementById("event-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="wrap">
      {celebrating && (
        <EventCelebration
          trophy={celebrating.trophy}
          winner={celebrating.winner}
          onDismiss={dismiss}
        />
      )}
      <Header tripName={tripName} badgeId={currentTrip?.badge_id} isAdmin={isAdmin} />

      {saveError && <div className="banner-note error">{saveError}</div>}

      {!hasActiveEvent && (
        <div className="card header-card" style={{ marginTop: 16 }}>
          <h1 style={{ fontSize: 26 }}>No current event</h1>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 14 }}>
            {currentTrip && (
              <button type="button" className="btn btn-ghost" onClick={() => setShowLastResults((v) => !v)}>
                {showLastResults ? "Hide last results" : "View last results"}
              </button>
            )}
            {isAdmin && (
              <button type="button" className="btn btn-primary" onClick={handleStartNewEvent}>
                Start New Event
              </button>
            )}
          </div>
        </div>
      )}

      {showResults && (
        <>
          <Champion standings={standings} />
          <Board
            standings={standings}
            trophyCounts={trophyCounts}
            isAdmin={hasActiveEvent && isAdmin}
            onAddPoints={addPointAdjustment}
          />
        </>
      )}

      {me && !me.icon_id && <IconPicker onPick={updateMyIcon} />}

      {isAdmin && currentTrip?.status === "active" && (
        <LogResultForm players={tripPlayers} onSave={saveEvent} />
      )}

      {isAdmin && (
        <div id="event-panel">
          <TripPanel
            currentTrip={currentTrip}
            players={players}
            standings={standings}
            open={tripPanelOpen}
            onOpenChange={setTripPanelOpen}
            onCreateTrip={createTrip}
            onEndTripNow={endTripNow}
            onDeclareWinner={declareTripWinner}
            onUpdateTrip={updateTripDetails}
          />
        </div>
      )}

      {isAdmin && (
        <PlayersPanel
          players={players}
          events={events}
          onCreate={createPlayerAccount}
          onRemove={removePlayer}
          onClearSaveError={clearSaveError}
          onSendMission={sendMission}
        />
      )}

      {showResults && (
        <History
          players={players}
          events={events}
          adjustments={adjustments}
          isAdmin={hasActiveEvent && isAdmin}
          onDelete={deleteEvent}
        />
      )}

      <Footer session={session} />
      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
