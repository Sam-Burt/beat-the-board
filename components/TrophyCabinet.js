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
// their event's badge and can be tapped for a summary popup; the rest stay
// empty dashed placeholders waiting to be filled in.
//
// Each slot is wrapped in a `.trophy-cell` that uses the padding-top: 100%
// trick to force a perfect square before anything inside is laid out. Plain
// `aspect-ratio: 1` on a CSS Grid item looks right in most browsers, but
// grid's default `align-items: stretch` can override it in some engines
// (notably iOS Safari) once a slot's content differs from its siblings —
// that's what was making the first (image-filled) trophy render as an oval
// next to perfectly circular empty ones. The padding hack sidesteps the
// stretch behaviour entirely instead of fighting it.
export default function TrophyCabinet({ trophies }) {
  const [open, setOpen] = useState(null); // trophy object, or null

  const slotCount = Math.max(MIN_SLOTS, trophies.length);
  const slots = Array.from({ length: slotCount }, (_, i) => trophies[i] || null);

  return (
    <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
      <h2>Trophies</h2>
      <p className="muted" style={{ fontSize: 13, margin: "4px 0 14px" }}>
        {trophies.length === 0
          ? "Win an event to start filling the cabinet."
          : `${trophies.length} event${trophies.length === 1 ? "" : "s"} won.`}
      </p>
      <div className="trophy-grid">
        {slots.map((t, i) => (
          <div className="trophy-cell" key={t ? t.id : `empty-${i}`}>
            {t ? (
              <button
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
              <button type="button" className="trophy-slot" disabled />
            )}
          </div>
        ))}
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
