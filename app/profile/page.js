"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { supabase } from "../../lib/supabaseClient";
import { iconSrc } from "../../lib/icons";
import IconPicker from "../../components/IconPicker";
import TrophyCabinet from "../../components/TrophyCabinet";
import BottomNav from "../../components/BottomNav";
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
  const { configured, loading, session, isAdmin, me, myTrophies, updateMyIcon, updateMyName } =
    useBoardData();

  const [changingIcon, setChangingIcon] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const [alertsState, setAlertsState] = useState("checking"); // checking | off | on | unsupported
  const [alertsWorking, setAlertsWorking] = useState(false);
  const [alertsError, setAlertsError] = useState("");

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

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

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Name can't be empty.");
      return;
    }
    setNameError("");
    setNameSaving(true);
    const ok = await updateMyName(trimmed);
    setNameSaving(false);
    if (ok) {
      setEditingName(false);
    } else {
      setNameError("Couldn't save that — check your connection and try again.");
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

  function signOut() {
    supabase?.auth.signOut();
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

        {editingName ? (
          <div className="rename-row">
            <input
              type="text"
              value={nameDraft}
              autoFocus
              maxLength={30}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
            />
            <button className="btn btn-primary" disabled={nameSaving} onClick={saveName}>
              {nameSaving ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditingName(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="profile-name">
            {me.name}
            <button
              className="edit-pencil"
              aria-label="Edit display name"
              onClick={() => {
                setNameDraft(me.name || "");
                setNameError("");
                setEditingName(true);
              }}
            >
              ✎
            </button>
          </div>
        )}
        {nameError && <div className="banner-note error">{nameError}</div>}

        <div className="profile-username-row">
          {isAdmin && !me.username
            ? "You sign in with your email."
            : `Signs in as @${me.username}`}
        </div>

        {changingIcon && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <IconPicker onPick={handlePickIcon} />
          </div>
        )}
      </div>

      <TrophyCabinet trophies={myTrophies || []} />

      <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
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
              says — that stays behind My Eyes Only on the Missions tab).
            </p>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary" disabled={alertsWorking} onClick={handleTurnOnAlerts}>
                {alertsWorking ? "Turning on…" : "Turn on mission alerts"}
              </button>
            </div>
          </>
        )}
        {alertsState === "on" && (
          <>
            <p className="alerts-status">🔔 Mission alerts are on for this device.</p>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <button className="btn btn-ghost" disabled={alertsWorking} onClick={handleTurnOffAlerts}>
                {alertsWorking ? "Turning off…" : "Turn off"}
              </button>
            </div>
          </>
        )}
        {alertsError && <div className="banner-note error">{alertsError}</div>}
      </div>

      <div className="btn-row" style={{ marginTop: 16, marginBottom: 4, justifyContent: "center" }}>
        <button type="button" className="btn btn-signout" onClick={signOut}>
          Sign out
        </button>
      </div>

      <BottomNav session={session} me={me} />
    </div>
  );
}
