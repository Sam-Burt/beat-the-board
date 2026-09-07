"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { totals } from "../../lib/points";
import { supabase } from "../../lib/supabaseClient";
import PlayerAvatar from "../../components/PlayerAvatar";
import BottomNav from "../../components/BottomNav";

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// Everyone reviews everyone's missions together once an event's done — this
// only works at all because of the "missions read once trip finalized" RLS
// policy (see schema.sql): nothing secret is left to protect for a
// finished event, so reads open up for that one trip specifically.
export default function MissionsReviewPage() {
  const router = useRouter();
  const { configured, loading, session, me, tripPlayers, events, adjustments, currentTrip } =
    useBoardData();

  const [missionsByPlayer, setMissionsByPlayer] = useState({});
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState("");

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  useEffect(() => {
    if (!supabase || !currentTrip) return;
    let cancelled = false;
    setMissionsLoading(true);
    supabase
      .from("missions")
      .select("id, player_id, title, text, status, photo_url, points, created_at")
      .eq("trip_id", currentTrip.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        const grouped = {};
        (data || []).forEach((m) => {
          (grouped[m.player_id] ||= []).push(m);
        });
        setMissionsByPlayer(grouped);
        setMissionsLoading(false);
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
          <p className="muted">
            No finished event, no photos, no shame. Come back when someone&#39;s actually done
            something.
          </p>
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
  const lastToFirst = [...standings].reverse();
  const allPhotos = Object.values(missionsByPlayer)
    .flat()
    .filter((m) => m.photo_url);

  async function handleDownloadAll() {
    if (allPhotos.length === 0) return;
    setZipError("");
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      await Promise.all(
        allPhotos.map(async (m, i) => {
          const res = await fetch(m.photo_url);
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
          zip.file(`${i + 1}-${(m.title || "mission").replace(/[^a-z0-9]+/gi, "-")}.${ext}`, blob);
        })
      );
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `${(currentTrip.name || "event").replace(/[^a-z0-9]+/gi, "-")}-mission-photos.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error(err);
      setZipError("Couldn't put that together — try again.");
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card header-card">
        <h1 style={{ fontSize: 22 }}>Secret Missions Review</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {currentTrip.name} — worst first, as is traditional
        </p>
      </div>

      {missionsLoading ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="subtitle">Loading&hellip;</div>
        </div>
      ) : (
        lastToFirst.map((s, i) => {
          const rank = lastToFirst.length - i;
          const playerMissions = missionsByPlayer[s.id] || [];
          return (
            <div className="card" style={{ marginTop: 16 }} key={s.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <PlayerAvatar iconId={s.iconId} emoji={s.emoji} size={32} />
                <h2 style={{ margin: 0, flex: 1 }}>{s.name}</h2>
                <span className="muted" style={{ fontSize: 13 }}>
                  {ordinal(rank)}
                </span>
              </div>

              {playerMissions.length === 0 ? (
                <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  Not one mission. Completely unbothered by all this.
                </p>
              ) : (
                playerMissions.map((m, i) => (
                  <div className="mission-proof-row" style={{ marginTop: 14 }} key={m.id}>
                    <div className="mission-proof-body">
                      {m.title && <div className="mission-proof-title">{m.title}</div>}
                      <div className="mission-proof-text">{m.text}</div>
                      <div className="mission-proof-points">
                        Worth {m.points} pt{m.points === 1 ? "" : "s"}
                      </div>
                      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {m.status === "completed"
                          ? `Actually did it. ${m.points} pt${m.points === 1 ? "" : "s"} ✅`
                          : m.status === "declined"
                            ? "Declined. Coward 🙅"
                            : "Ignored it and hoped nobody would notice"}
                      </p>
                    </div>
                    {m.photo_url && (
                      <button
                        type="button"
                        className={`mission-polaroid${i % 2 === 1 ? " mission-polaroid-alt" : ""}`}
                        onClick={() => setLightboxUrl(m.photo_url)}
                        aria-label="View proof photo full size"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.photo_url} alt="" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })
      )}

      {allPhotos.length > 0 && (
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button type="button" className="btn btn-primary" disabled={zipping} onClick={handleDownloadAll}>
            {zipping ? "Zipping…" : "Download all photos"}
          </button>
        </div>
      )}
      {zipError && <div className="banner-note error" style={{ marginTop: 10 }}>{zipError}</div>}

      {lightboxUrl && (
        <div className="modal-backdrop" onClick={() => setLightboxUrl(null)}>
          <button
            type="button"
            className="mission-lightbox-close"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close photo"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mission-lightbox-img" src={lightboxUrl} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
