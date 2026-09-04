import { badgeSrc } from "../lib/badges";

// Pure display now — no inline rename here (that used to add a pencil
// button next to the title, which threw the centering off since the title
// was no longer the only thing in the row). Renaming/editing the current
// event's details lives in the Event panel instead (see TripPanel's "Edit
// event" button), right next to the rest of the event's settings.
export default function Header({ tripName, badgeId, isAdmin }) {
  const src = badgeSrc(badgeId);

  return (
    <div className="card header-card">
      {!isAdmin && <span className="readonly-badge corner">● Live</span>}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="header-trip-badge" src={src} alt="" />
      )}
      <div className="trip-name">
        <h1>{tripName}</h1>
      </div>
    </div>
  );
}
