import Link from "next/link";

// Only ever shown to a signed-out visitor now — once you're signed in,
// navigation (and signing out) lives in the bottom tab bar / Profile page
// instead of small text links down here.
export default function Footer({ session }) {
  if (session) return null;

  return (
    <div className="footer">
      Following along live. <Link href="/login">Sign in</Link>
    </div>
  );
}
