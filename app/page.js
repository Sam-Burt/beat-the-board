"use client";

import { useBoardData } from "../lib/useBoardData";
import { totals } from "../lib/points";
import Header from "../components/Header";
import Champion from "../components/Champion";
import Board from "../components/Board";
import LogResultForm from "../components/LogResultForm";
import PlayersPanel from "../components/PlayersPanel";
import IconPicker from "../components/IconPicker";
import History from "../components/History";
import Footer from "../components/Footer";

export default function HomePage() {
  const {
    configured,
    loading,
    tripName,
    players,
    events,
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
    renameTrip,
  } = useBoardData();

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

  const standings = totals(players, events);

  return (
    <div className="wrap">
      <Header tripName={tripName} isAdmin={isAdmin} onRename={renameTrip} />

      {saveError && <div className="banner-note error">{saveError}</div>}

      <Champion standings={standings} />
      <Board standings={standings} />

      {me && !me.icon_id && <IconPicker onPick={updateMyIcon} />}

      {isAdmin && <LogResultForm players={players} onSave={saveEvent} />}
      {isAdmin && (
        <PlayersPanel
          players={players}
          events={events}
          onCreate={createPlayerAccount}
          onRemove={removePlayer}
          onSendMission={sendMission}
        />
      )}

      <History players={players} events={events} isAdmin={isAdmin} onDelete={deleteEvent} />

      <Footer session={session} isAdmin={isAdmin} me={me} />
    </div>
  );
}
