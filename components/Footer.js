import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

export default function Footer({ session, isAdmin, me }) {
  function signOut(e) {
    e.preventDefault();
    supabase?.auth.signOut();
  }

  if (isAdmin) {
    return (
      <div className="footer">
        You&#39;re running the board — add results as you go.{" "}
        <a href="#" onClick={signOut}>
          Sign out
        </a>
      </div>
    );
  }

  if (session) {
    return (
      <div className="footer">
        Signed in{me?.name ? ` as ${me.name}` : ""}.{" "}
        <a href="#" onClick={signOut}>
          Sign out
        </a>
      </div>
    );
  }

  return (
    <div className="footer">
      Following along live. <Link href="/login">Sign in</Link>
    </div>
  );
}
