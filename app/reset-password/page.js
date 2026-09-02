"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

// Landing page for the link in a "reset your password" email. Supabase
// puts a temporary recovery session in the URL, which the client picks up
// automatically (detectSessionInUrl, on by default) — so by the time this
// page renders, supabase.auth.updateUser can set a new password directly.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 6) {
      setError("Password needs to be at least 6 characters.");
      return;
    }
    setWorking(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setWorking(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/"), 1500);
  }

  return (
    <div className="wrap auth-wrap">
      <div className="card header-card">
        <h1 style={{ fontSize: 24 }}>Set a new password</h1>
        <div className="subtitle">Beat The Board</div>
      </div>
      {done ? (
        <div className="card">
          <p>Password updated. Taking you back to the board&hellip;</p>
        </div>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="banner-note error">{error}</div>}
          <div className="btn-row">
            <button className="btn btn-primary" disabled={working}>
              {working ? "Saving…" : "Save new password"}
            </button>
          </div>
        </form>
      )}
      <div className="footer">
        If this link has expired, request a new one from the sign-in page.
      </div>
    </div>
  );
}
