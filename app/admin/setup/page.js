"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

// First-run bootstrap: creates the ONE admin account for this board. Safe to
// leave this page live after setup — the database policy only allows the
// admins-table insert while that table is still empty, so a second attempt
// (by anyone) is rejected server-side regardless of what this page does.
export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | working | done | already | error
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    setStatus("working");
    setMessage("");

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) {
      setStatus("error");
      setMessage(signUpError.message);
      return;
    }

    // If email confirmation is required, there's no session yet — sign in
    // directly so we can make the admins-table insert in this same visit.
    let userId = signUpData.user?.id;
    if (!signUpData.session) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setStatus("done");
        setMessage(
          "Account created. Check your email to confirm it, then come back and sign in at /admin."
        );
        return;
      }
      userId = signInData.user?.id;
    }

    const { error: insertError } = await supabase.from("admins").insert({ user_id: userId });
    if (insertError) {
      if (insertError.code === "42P01") {
        // The admins table (and likely the whole schema) doesn't exist yet —
        // supabase/schema.sql was never run against this Supabase project.
        // This is NOT "someone already set up an admin" — don't say that.
        setStatus("error");
        setMessage(
          "The database isn't set up yet — run supabase/schema.sql in your Supabase project's SQL Editor (see the README), then come back and try again."
        );
        return;
      }
      // Most likely cause otherwise: an admin already exists, so the
      // bootstrap policy refused the insert. That's expected once setup has
      // already run.
      setStatus("already");
      setMessage(
        "This board already has an admin set up. If that's you, sign in instead — otherwise ask whoever set it up."
      );
      return;
    }

    setStatus("done");
    setMessage("You're set up as the admin. Head to the board and sign in.");
  }

  return (
    <div className="wrap auth-wrap">
      <div className="card header-card">
        <h1 style={{ fontSize: 24 }}>Set up admin</h1>
        <div className="subtitle">One-time — creates the account that can edit the board</div>
      </div>

      {status === "done" || status === "already" ? (
        <div className="card">
          <p>{message}</p>
          <div className="btn-row">
            <Link href="/login" className="btn btn-primary">
              Go to sign in
            </Link>
          </div>
        </div>
      ) : (
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {status === "error" && <div className="banner-note error">{message}</div>}
          <div className="btn-row">
            <button className="btn btn-primary" disabled={status === "working"}>
              {status === "working" ? "Creating…" : "Create admin account"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
