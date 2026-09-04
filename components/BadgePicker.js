"use client";

import { BADGE_IDS, badgeSrc } from "../lib/badges";

// A controlled grid of trophy badges to choose from when setting up a new
// trip — same look as IconPicker, but a plain controlled picker (value +
// onChange) rather than something that saves immediately, since it's just
// one field inside the bigger "new trip" form. These are placeholders
// (see lib/badges.js) until real illustrated badge art is uploaded.
export default function BadgePicker({ value, onChange }) {
  return (
    <div className="icon-picker-grid">
      {BADGE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={`icon-picker-btn${value === id ? " selected" : ""}`}
          onClick={() => onChange(id)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeSrc(id)} alt="" width={56} height={56} />
        </button>
      ))}
    </div>
  );
}
