"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

// Shared sign-in for anyone with an account — the admin and any player
// Sam has created a login for. What you can actually do once you're in
// depends on your account (admin vs. a linked player row), decided
// server-side by the RLS policies, not by anything on this page.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    setWorking(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setWorking(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/");
  }

  async function handleForgotPassword() {
    if (!supabase) return;
    if (!email.trim()) {
      setError("Enter your email above first, then tap “Forgot password” again.");
      return;
    }
    setError("");
    setWorking(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setWorking(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="wrap auth-wrap">
      <div className="card header-card">
        <h1 style={{ fontSize: 24 }}>Sign in</h1>
        <div className="subtitle">Beat The Board</div>
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <div className="banner-note error">{error}</div>}
        {resetSent && (
          <div className="banner-note">
            If that email has an account, a reset link is on its way to it.
          </div>
        )}
        <div className="btn-row">
          <button className="btn btn-primary" disabled={working}>
            {working ? "Signing in…" : "Sign in"}
          </button>
          <Link href="/" className="btn btn-ghost">
            Back to board
          </Link>
        </div>
      </form>
      <div className="footer">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleForgotPassword();
          }}
        >
          Forgot password?
        </a>
      </div>
      <div className="footer">
        First time setting this board up? <Link href="/admin/setup">Create the admin account</Link>
      </div>
    </div>
  );
}
