"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { supabase } from "../../lib/supabaseClient";
import Footer from "../../components/Footer";
import BottomNav from "../../components/BottomNav";

export default function MissionsPage() {
  const router = useRouter();
  const { configured, loading, session, isAdmin, me } = useBoardData();

  const [missions, setMissions] = useState([]);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // This player's secret missions, newest first, live-updated so a mission
  // sent while this page is open shows up without a reload.
  useEffect(() => {
    if (!supabase || !me) return;
    let cancelled = false;

    function load() {
      supabase
        .from("missions")
        .select("id, text, created_at")
        .eq("player_id", me.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (!cancelled && data) setMissions(data);
        });
    }
    load();

    const channel = supabase
      .channel(`missions-${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "missions", filter: `player_id=eq.${me.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [me]);

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

  return (
    <div className="wrap">
      <div className="card header-card">
        <h2>Secret missions</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Just for you — nobody else can see these.
        </p>
      </div>

      <div className="mission-flip-wrap">
        <div className={`mission-flip-card${revealed ? " flipped" : ""}`}>
          <div className="mission-flip-front" onClick={() => setRevealed(true)}>
            <div className="flip-hint">👁 My Eyes Only</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {missions.length === 0
                ? "Tap to check for secret missions."
                : `Tap to reveal ${missions.length} mission${missions.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className="mission-flip-back" onClick={() => setRevealed(false)}>
            {missions.length === 0 ? (
              <div className="empty">No missions yet — check back later.</div>
            ) : (
              <div className="mission-list">
                {missions.map((m) => (
                  <div className="mission-item" key={m.id}>
                    <div className="mission-date">
                      {new Date(m.created_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                    <div className="mission-text">{m.text}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Tap to flip back
            </p>
          </div>
        </div>
      </div>

      <Footer session={session} isAdmin={isAdmin} me={me} />
      <BottomNav session={session} me={me} />
    </div>
  );
}
