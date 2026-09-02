import { iconSrc } from "../lib/icons";

// Shows a player's chosen profile icon if they have one, falling back to
// their free-text emoji, falling back to nothing. Used anywhere a player's
// name is shown (leaderboard rows, chips, history).
export default function PlayerAvatar({ iconId, emoji, size = 18 }) {
  const src = iconSrc(iconId);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: "50%", display: "inline-block", verticalAlign: "middle" }}
      />
    );
  }
  if (emoji) return <span>{emoji}</span>;
  return null;
}
