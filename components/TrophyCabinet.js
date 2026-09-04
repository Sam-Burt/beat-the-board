"use client";

import { useState } from "react";
import { badgeSrc } from "../lib/badges";

const MIN_SLOTS = 9;

function fmtDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The "Trophies" card on a player's profile — a 3x3 (or bigger, once they've
// won enough to outgrow it) grid of circular slots. Earned trophies show
// their trip's badge and can be tapped for a summary popup; the rest stay
// empty dashed placeholders waiting to be filled in.
export default function TrophyCabinet({ trophies }) {
  const [open, setOpen] = useState(null); // trophy object, or null

  const slotCount = Math.max(MIN_SLOTS, trophies.length);
  const slots = Array.from({ length: slotCount }, (_, i) => trophies[i] || null);

  return (
    <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
      <h2>Trophies</h2>
      <p className="muted" style={{ fontSize: 13, margin: "4px 0 14px" }}>
        {trophies.length === 0
          ? "Win a trip to start filling the cabinet."
          : `${trophies.length} trip${trophies.length === 1 ? "" : "s"} won.`}
      </p>
      <div className="trophy-grid">
        {slots.map((t, i) =>
          t ? (
            <button
              key={t.id}
              type="button"
              className="trophy-slot earned"
              onClick={() => setOpen(t)}
              aria-label={`${t.trip_name} — view details`}
            >
              {badgeSrc(t.badge_id) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={badgeSrc(t.badge_id)} alt="" />
              )}
            </button>
          ) : (
            <button key={`empty-${i}`} type="button" className="trophy-slot" disabled />
          )
        )}
      </div>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            {badgeSrc(open.badge_id) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={badgeSrc(open.badge_id)} alt="" />
            )}
            <h3>{open.trip_name}</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {open.starts_on && open.ends_on
                ? `${fmtDate(open.starts_on)} – ${fmtDate(open.ends_on)}`
                : "No date window set"}
            </p>
            <p style={{ fontSize: 15, marginTop: 10 }}>
              Won with <strong>{open.points}</strong> point{open.points === 1 ? "" : "s"}
            </p>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Awarded {fmtDate(open.awarded_at?.slice(0, 10))}
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
