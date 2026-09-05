"use client";

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
import NotificationBell from "../components/NotificationBell";
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
  // this lives here rather than after the loading/configured checks.
  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players);

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
      <Header tripName={tripName} badgeId={currentTrip?.badge_id} isAdmin={isAdmin} />

      {saveError && <div className="banner-note error">{saveError}</div>}

      <Champion standings={standings} />
      <Board
        standings={standings}
        trophyCounts={trophyCounts}
        isAdmin={isAdmin}
        onAddPoints={addPointAdjustment}
      />

      {me && !me.icon_id && <IconPicker onPick={updateMyIcon} />}

      {isAdmin && currentTrip?.status === "active" && (
        <LogResultForm players={tripPlayers} onSave={saveEvent} />
      )}

      {isAdmin && (
        <TripPanel
          currentTrip={currentTrip}
          players={players}
          standings={standings}
          onCreateTrip={createTrip}
          onEndTripNow={endTripNow}
          onDeclareWinner={declareTripWinner}
          onUpdateTrip={updateTripDetails}
        />
      )}

      {isAdmin && (
        <PlayersPanel
          players={players}
          events={events}
          onCreate={createPlayerAccount}
          onRemove={removePlayer}
          onSendMission={sendMission}
        />
      )}

      <History
        players={players}
        events={events}
        adjustments={adjustments}
        isAdmin={isAdmin}
        onDelete={deleteEvent}
      />

      <Footer session={session} />
      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
