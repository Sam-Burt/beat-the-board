"use client";

import { useState } from "react";
import { GENERIC_TROPHY_IDS, genericTrophySrc } from "../lib/trophies";

// A controlled grid of trophies to choose from when setting up (or
// editing) a trip — same look as IconPicker, but a plain controlled
// picker (value + onChange) rather than something that saves immediately,
// since it's just one field inside a bigger form. Two pools: the fixed
// GENERIC set (placeholders — see lib/trophies.js — until real illustrated
// art replaces one) and EVENT trophies, real artwork uploaded for a
// specific one-off event, which is why this component also carries the
// upload form rather than just being a picker.
export default function TrophyPicker({ value, onChange, eventTrophies, onUpload }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleUpload(e) {
    e.preventDefault();
    if (!label.trim() || !file || uploading) return;
    setUploading(true);
    setUploadError("");
    const result = await onUpload({ label: label.trim(), file });
    setUploading(false);
    if (result?.ok) {
      onChange(result.trophy.id);
      setUploadOpen(false);
      setLabel("");
      setFile(null);
    } else {
      setUploadError(result?.error || "Couldn't upload that — try again.");
    }
  }

  return (
    <div>
      {eventTrophies?.length > 0 && (
        <>
          <label>Event trophies</label>
          <div className="icon-picker-grid" style={{ marginBottom: 14 }}>
            {eventTrophies.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`icon-picker-btn${value === t.id ? " selected" : ""}`}
                onClick={() => onChange(t.id)}
                title={t.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.image_url} alt={t.label} width={56} height={56} />
              </button>
            ))}
          </div>
        </>
      )}

      {!uploadOpen ? (
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setUploadOpen(true)}>
            + Upload event trophy
          </button>
        </div>
      ) : (
        <form className="points-composer" style={{ marginBottom: 14 }} onSubmit={handleUpload}>
          <label>New event trophy</label>
          <input
            type="text"
            placeholder="Name it, e.g. Centre Parcs 2026"
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginTop: 8 }}
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={!label.trim() || !file || uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setUploadOpen(false);
                setLabel("");
                setFile(null);
                setUploadError("");
              }}
            >
              Cancel
            </button>
          </div>
          {uploadError && <div className="banner-note error">{uploadError}</div>}
        </form>
      )}

      <label>Generic</label>
      <div className="icon-picker-grid">
        {GENERIC_TROPHY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`icon-picker-btn${value === id ? " selected" : ""}`}
            onClick={() => onChange(id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={genericTrophySrc(id)} alt="" width={56} height={56} />
          </button>
        ))}
      </div>
    </div>
  );
}
