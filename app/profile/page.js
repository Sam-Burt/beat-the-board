"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { supabase } from "../../lib/supabaseClient";
import { iconSrc } from "../../lib/icons";
import IconPicker from "../../components/IconPicker";
import {
  pushSupported,
  runningStandalone,
  isIOS,
  currentSubscription,
  subscribeToMissionAlerts,
  unsubscribeFromMissionAlerts,
} from "../../lib/push";

export default function ProfilePage() {
  const router = useRouter();
  const { configured, loading, session, isAdmin, me, updateMyIcon } = useBoardData();

  const [changingIcon, setChangingIcon] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  const [missions, setMissions] = useState([]);
  const [revealed, setRevealed] = useState(false);

  const [alertsState, setAlertsState] = useState("checking"); // checking | off | on | unsupported
  const [alertsWorking, setAlertsWorking] = useState(false);
  const [alertsError, setAlertsError] = useState("");

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // This player's secret missions, newest first, live-updated so a mission
  // sent while this page is open shows up without a reload.
  useEffect(() => {
    if (!supabase || !me) return;
    let cancelled = false;

    function load() {
      supabase
        .from("missions")
        .select("id, text, created_at")
        .eq("player_id", me.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (!cancelled && data) setMissions(data);
        });
    }
    load();

    const channel = supabase
      .channel(`missions-${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "missions", filter: `player_id=eq.${me.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [me]);

  useEffect(() => {
    if (!pushSupported()) {
      setAlertsState("unsupported");
      return;
    }
    currentSubscription().then((sub) => setAlertsState(sub ? "on" : "off"));
  }, []);

  const handlePickIcon = useCallback(
    async (iconId) => {
      await updateMyIcon(iconId);
      setChangingIcon(false);
    },
    [updateMyIcon]
  );

  async function saveUsername() {
    if (!session) return;
    setUsernameError("");
    setUsernameSaving(true);
    try {
      const res = await fetch("/api/profile/update-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ username: usernameDraft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUsernameError(json.error || "Couldn't save that.");
        return;
      }
      setEditingUsername(false);
    } catch {
      setUsernameError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setUsernameSaving(false);
    }
  }

  async function handleTurnOnAlerts() {
    if (!me) return;
    setAlertsError("");
    setAlertsWorking(true);
    try {
      await subscribeToMissionAlerts(me.id);
      setAlertsState("on");
    } catch (err) {
      setAlertsError(err.message || "Couldn't turn on alerts.");
    } finally {
      setAlertsWorking(false);
    }
  }

  async function handleTurnOffAlerts() {
    setAlertsWorking(true);
    try {
      await unsubscribeFromMissionAlerts();
      setAlertsState("off");
    } catch {
      // Leave state as-is — worst case they just try again.
    } finally {
      setAlertsWorking(false);
    }
  }

  if (!configured || loading || !session) {
    return (
      <div className="wrap">
        <div className="card header-card">
          <div className="subtitle">Loading&hellip;</div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="wrap">
        <div className="card">
          <h2>No profile yet</h2>
          <p className="muted">
            Your account isn&#39;t linked to a player on the board yet — ask whoever runs it to
            add you from the Players panel.
          </p>
          <div className="btn-row">
            <Link href="/" className="btn btn-primary">
              Back to board
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const src = iconSrc(me.icon_id);

  return (
    <div className="wrap">
      <div className="card profile-hero">
        <button
          type="button"
          className="profile-icon-btn"
          onClick={() => setChangingIcon((v) => !v)}
          aria-label="Change your icon"
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" />
          ) : (
            <span className="profile-icon-fallback">{me.emoji || "👤"}</span>
          )}
          <span className="profile-icon-edit-hint">✎</span>
        </button>

        <div className="profile-name">{me.name}</div>

        <div className="profile-username-row">
          {editingUsername ? (
            <div className="rename-row">
              <input
                type="text"
                value={usernameDraft}
                autoFocus
                maxLength={20}
                onChange={(e) => setUsernameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveUsername();
                  if (e.key === "Escape") setEditingUsername(false);
                }}
              />
              <button className="btn btn-primary" disabled={usernameSaving} onClick={saveUsername}>
                {usernameSaving ? "Saving…" : "Save"}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditingUsername(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              @{me.username || "no-username-set"}
              <button
                className="edit-pencil"
                aria-label="Edit username"
                onClick={() => {
                  setUsernameDraft(me.username || "");
                  setUsernameError("");
                  setEditingUsername(true);
                }}
              >
                ✎
              </button>
            </>
          )}
        </div>
        {usernameError && <div className="banner-note error">{usernameError}</div>}
        {isAdmin ? (
          <p className="muted" style={{ fontSize: 12 }}>
            This is just a label — you&#39;ll always sign in with your email.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            This is what you type to sign in.
          </p>
        )}

        {changingIcon && (
          <div style={{ marginTop: 14, textAlign: "left" }}>
            <IconPicker onPick={handlePickIcon} />
          </div>
        )}
      </div>

      <div className="mission-flip-wrap">
        <div className={`mission-flip-card${revealed ? " flipped" : ""}`}>
          <div className="mission-flip-front" onClick={() => setRevealed(true)}>
            <div className="flip-hint">👁 My Eyes Only</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {missions.length === 0
                ? "Tap to check for secret missions."
                : `Tap to reveal ${missions.length} mission${missions.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className="mission-flip-back" onClick={() => setRevealed(false)}>
            {missions.length === 0 ? (
              <div className="empty">No missions yet — check back later.</div>
            ) : (
              <div className="mission-list">
                {missions.map((m) => (
                  <div className="mission-item" key={m.id}>
                    <div className="mission-date">
                      {new Date(m.created_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                    <div className="mission-text">{m.text}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Tap to flip back
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Mission alerts</h2>
        {alertsState === "unsupported" && (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Phone alerts aren&#39;t available in this browser.
            {isIOS() && !runningStandalone() && (
              <>
                {" "}
                On iPhone: open this site in Safari, tap Share → <strong>Add to Home Screen</strong>,
                then open it from there — Apple only allows push alerts for installed sites, not
                regular Safari tabs.
              </>
            )}
          </p>
        )}
        {alertsState === "off" && (
          <>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Get a ping on your phone the moment a new mission lands (it won&#39;t show what it
              says — that stays behind My Eyes Only above).
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={alertsWorking} onClick={handleTurnOnAlerts}>
                {alertsWorking ? "Turning on…" : "Turn on mission alerts"}
              </button>
            </div>
          </>
        )}
        {alertsState === "on" && (
          <>
            <p className="alerts-status">🔔 Mission alerts are on for this device.</p>
            <div className="btn-row">
              <button className="btn btn-ghost" disabled={alertsWorking} onClick={handleTurnOffAlerts}>
                {alertsWorking ? "Turning off…" : "Turn off"}
              </button>
            </div>
          </>
        )}
        {alertsError && <div className="banner-note error">{alertsError}</div>}
      </div>

      <div className="footer">
        <Link href="/">Back to board</Link>
      </div>
    </div>
  );
}
