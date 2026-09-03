"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { loginInputToEmail } from "../../lib/username";

// Shared sign-in for anyone with an account — the admin and any player
// Sam has created a login for. What you can actually do once you're in
// depends on your account (admin vs. a linked player row), decided
// server-side by the RLS policies, not by anything on this page.
//
// Everyone except the admin signs in with a short username; the admin
// signs in with their real email. Whatever's typed here is expanded into
// the right Supabase email behind the scenes by loginInputToEmail — see
// lib/username.js.
export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    setWorking(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginInputToEmail(loginId),
      password,
    });
    setWorking(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/");
  }

  async function handleForgotPassword() {
    if (!supabase) return;
    const trimmed = loginId.trim();
    if (!trimmed) {
      setError("Enter your username or email above first, then tap “Forgot password” again.");
      return;
    }
    if (!trimmed.includes("@")) {
      // Usernames map to a made-up address with no real inbox behind it —
      // a reset email there would silently go nowhere. Send them to the
      // person who can actually reset it instead of pretending it worked.
      setError(
        "Since you sign in with a username rather than an email, ask whoever set up your account to reset your password for you."
      );
      return;
    }
    setError("");
    setWorking(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
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
          <label htmlFor="login-id">Username</label>
          <input
            id="login-id"
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="the username you were given"
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Set the board up? Use your email instead.
          </p>
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
