"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoardData } from "../../lib/useBoardData";
import { useEventCelebration } from "../../lib/useEventCelebration";
import { useLeroyAlert } from "../../lib/useLeroyAlert";
import { supabase } from "../../lib/supabaseClient";
import BottomNav from "../../components/BottomNav";
import EventCelebration from "../../components/EventCelebration";
import LeroyAlert from "../../components/LeroyAlert";
import TradeAlert from "../../components/TradeAlert";
import PlayerAvatar from "../../components/PlayerAvatar";

// Copy for the cheat-code result popup, keyed by outcome (or by reward,
// for a win — see handleRedeem). "invalid" and "reused" are terminal
// outcomes from app/api/tricks/cheat-code; "points"/"leroy"/"jackpot" are
// what a real win actually pays out.
const CHEAT_CODE_COPY = {
  invalid: {
    kicker: "Nope",
    headline: "Better Luck Next Time",
    subtext: "That's not a real code. Or you fat-fingered it. Either way, nothing for you.",
  },
  reused: {
    kicker: "Oi",
    headline: "You Greedy Bastard",
    subtext: "You've already burned that one this event. That's 5 points gone for trying it twice.",
  },
  points: {
    kicker: "Nice",
    headline: "+5 Points",
    subtext: "Lucky sod. Don't get used to it.",
  },
  leroy: {
    kicker: "Nice",
    headline: "An Extra Leroy",
    subtext: "Go on then. Ruin someone else's day too.",
    icon: { type: "img", src: "/icons/leroy.png" },
  },
  jackpot: {
    kicker: "Nice",
    headline: "An Extra Jackpot",
    subtext: "Don't waste this one either.",
    icon: { type: "img", src: "/icons/jackpot-icon.png" },
  },
};

export default function TricksPage() {
  const router = useRouter();
  const {
    configured,
    loading,
    session,
    me,
    isAdmin,
    players,
    tripPlayers,
    currentTrip,
    trophies,
    eventTrophies,
    leroySends,
    sendLeroy,
    guessLeroy,
    startLeroyGuessWindow,
    missionTrades,
    respondTrade,
    pointBoosts,
    activateBoost,
    confirmBoost,
    cheatCodes,
    cheatCodeRedemptions,
    redeemCheatCode,
    addCheatCode,
    clearCheatCodes,
  } = useBoardData();

  const { celebrating, dismiss } = useEventCelebration(trophies, currentTrip, players, me);
  const { alerting: leroyAlert, dismiss: dismissLeroyAlert } = useLeroyAlert(
    leroySends,
    players,
    me,
    startLeroyGuessWindow
  );
  const incomingTrade =
    me && currentTrip && currentTrip.status !== "finalized"
      ? missionTrades.find(
          (t) => t.recipient_player_id === me.id && t.status === "pending" && t.trip_id === currentTrip.id
        )
      : null;
  const incomingTradeProposer = incomingTrade
    ? players.find((p) => p.id === incomingTrade.proposer_player_id)
    : null;

  const [leroyHelpOpen, setLeroyHelpOpen] = useState(false);
  const [boostHelpOpen, setBoostHelpOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [boosting, setBoosting] = useState(false);
  const [boostError, setBoostError] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmError, setConfirmError] = useState("");

  const [cheatCodeOpen, setCheatCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemResult, setRedeemResult] = useState(null); // a CHEAT_CODE_COPY key, or null

  const [newCode, setNewCode] = useState("");
  const [addingCode, setAddingCode] = useState(false);
  const [addCodeError, setAddCodeError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // Clears the pink dot BottomNav shows for a Leroy send landing on you,
  // or a Jackpot request going out — landing on this tab at all counts as
  // "seen", same as Missions/Gay Card do.
  useEffect(() => {
    if (!supabase || !me) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("player_id", me.id)
      .in("kind", ["leroy", "jackpot"])
      .is("read_at", null)
      .then(() => {});
  }, [me]);

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
            You exist, technically, but not on the board. Go and ask whoever runs this to
            add you from the Players panel, and try to sound like you deserve it.
          </p>
        </div>
      </div>
    );
  }

  const eventLive = !!currentTrip && (currentTrip.status === "active" || currentTrip.status === "tied");
  const now = new Date();

  // Cheat codes can hand out extra Leroy/Jackpot charges on top of the
  // free one everyone gets — see app/api/tricks/cheat-code and the
  // matching allowance checks in app/api/leroy/send and
  // app/api/tricks/boost. Everything below just mirrors that same math
  // client-side to decide what to show.
  const mySends = leroySends.filter((l) => l.sender_id === me.id);
  const myBoosts = pointBoosts.filter((b) => b.player_id === me.id);
  const myRedemptions = cheatCodeRedemptions.filter((r) => r.player_id === me.id);
  const leroyAllowed = 1 + myRedemptions.filter((r) => r.reward === "leroy").length;
  const jackpotAllowed = 1 + myRedemptions.filter((r) => r.reward === "jackpot").length;
  const leroyRemaining = Math.max(0, leroyAllowed - mySends.length);
  const jackpotRemaining = Math.max(0, jackpotAllowed - myBoosts.length);
  const leroyHasUnresolved = mySends.some((s) => !s.resolved_at);

  const leroyLabel =
    leroyRemaining > 0
      ? "He's Available"
      : leroyHasUnresolved
      ? "He's Casing His Target"
      : "He's Bored Of Your Shit";

  // Anything activated but not yet confirmed, and not already expired —
  // this is what an admin needs to actually see and act on to make the
  // trick usable at all (see app/api/admin/confirm-boost).
  const pendingConfirmations = pointBoosts.filter(
    (b) => !b.resolved_at && !b.confirmed_at && new Date(b.expires_at) > now
  );

  async function handleSend() {
    if (!target) return;
    setSendError("");
    setSending(true);
    const result = await sendLeroy({ targetId: target });
    setSending(false);
    if (result?.ok) {
      setTarget(null);
    } else {
      setSendError(result?.error || "Couldn't send him — try again.");
    }
  }

  async function handleBoost() {
    setBoostError("");
    setBoosting(true);
    const result = await activateBoost();
    setBoosting(false);
    if (!result?.ok) {
      setBoostError(result?.error || "Couldn't activate it — try again.");
    }
  }

  async function handleConfirm(boostId) {
    setConfirmError("");
    setConfirmingId(boostId);
    const result = await confirmBoost({ boostId });
    setConfirmingId(null);
    if (!result?.ok) {
      setConfirmError(result?.error || "Couldn't confirm it — try again.");
    }
  }

  async function handleRedeem(e) {
    e?.preventDefault();
    if (!codeInput.trim() || redeeming) return;
    setRedeemError("");
    setRedeeming(true);
    const result = await redeemCheatCode(codeInput);
    setRedeeming(false);
    if (!result?.ok) {
      setRedeemError(result?.error || "Couldn't check that — try again.");
      return;
    }
    const { outcome, reward } = result.data || {};
    setCodeInput("");
    setCheatCodeOpen(false);
    setRedeemResult(outcome === "won" ? reward : outcome);
  }

  async function handleAddCode(e) {
    e?.preventDefault();
    if (!newCode.trim() || addingCode) return;
    setAddCodeError("");
    setAddingCode(true);
    const ok = await addCheatCode(newCode);
    setAddingCode(false);
    if (ok) {
      setNewCode("");
    } else {
      setAddCodeError("Couldn't add that — maybe it already exists.");
    }
  }

  async function handleClearCodes() {
    setClearing(true);
    await clearCheatCodes();
    setClearing(false);
    setConfirmClear(false);
  }

  const resultCopy = redeemResult ? CHEAT_CODE_COPY[redeemResult] : null;

  return (
    <div className="wrap">
      {celebrating && (
        <EventCelebration
          trophy={celebrating.trophy}
          winner={celebrating.winner}
          variant={celebrating.variant}
          eventTrophies={eventTrophies}
          onDismiss={dismiss}
        />
      )}
      {leroyAlert && (
        <LeroyAlert
          leroy={leroyAlert.leroy}
          tripPlayers={tripPlayers}
          me={me}
          onGuess={guessLeroy}
          onDismiss={dismissLeroyAlert}
        />
      )}
      <TradeAlert trade={incomingTrade} proposerName={incomingTradeProposer?.name} onRespond={respondTrade} />

      {resultCopy && (
        <div className="celebration-backdrop" onClick={() => setRedeemResult(null)}>
          <div className="card celebration-card" onClick={(e) => e.stopPropagation()}>
            {resultCopy.icon?.type === "img" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="celebration-crown" src={resultCopy.icon.src} alt="" />
            )}
            {resultCopy.icon?.type === "emoji" && (
              <div className="celebration-crown celebration-crown-emoji" aria-hidden="true">
                {resultCopy.icon.char}
              </div>
            )}
            <div className="celebration-kicker">{resultCopy.kicker}</div>
            <h2 className="leroy-headline">{resultCopy.headline}</h2>
            <p className="celebration-subtext">{resultCopy.subtext}</p>
            <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
              <button type="button" className="btn btn-primary" onClick={() => setRedeemResult(null)}>
                Yeah, alright
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card header-card">
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h1 style={{ fontSize: 26 }}>Tricks</h1>
          <button
            type="button"
            className="card-help-btn"
            onClick={() => setCheatCodeOpen(true)}
            aria-label="Enter a cheat code"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 3h6v5h5v6h-5v5H9v-5H4V8h5V3Z" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {cheatCodeOpen && (
        <div className="modal-backdrop" onClick={() => setCheatCodeOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Got a code?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Type it in and find out. Fifty-fifty it&#39;s actually worth something.
            </p>
            <form onSubmit={handleRedeem}>
              <input
                type="text"
                className="cheat-code-input"
                placeholder="Enter code"
                maxLength={40}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                autoFocus
              />
              <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
                <button type="submit" className="btn btn-primary" disabled={!codeInput.trim() || redeeming}>
                  {redeeming ? "Trying…" : "Try My Luck"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setCheatCodeOpen(false);
                    setRedeemError("");
                  }}
                >
                  Cancel
                </button>
              </div>
              {redeemError && <div className="banner-note error">{redeemError}</div>}
            </form>
          </div>
        </div>
      )}

      {leroyHelpOpen && (
        <div className="modal-backdrop" onClick={() => setLeroyHelpOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>What is this?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              You get one shot per event to ruin someone&#39;s day. Pick a victim. The exact
              second they try to play anything, Leroy mugs them for 5 points and hands them to
              you. We notify them immediately. They can&#39;t stop it, they just have to sit
              there and take it like a bitch.
            </p>
            <h3 style={{ marginTop: 18 }}>Can they get it back?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              The second he strikes, they get told and get 60 seconds to guess who sent him.
              Guess right and they get their 5 back, plus 5 more out of your pocket. Guess
              wrong, or they&#39;re not fast enough, and they never find out it was you.
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setLeroyHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {boostHelpOpen && (
        <div className="modal-backdrop" onClick={() => setBoostHelpOpen(false)}>
          <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>What is this?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              One shot per event. Real double or nothing: come first in your next game and
              everything you scored gets doubled. Come anything else and that game&#39;s worth
              precisely zero. No middle ground, no consolation prize.
            </p>
            <h3 style={{ marginTop: 18 }}>Why do I need it confirmed?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Because results get logged after the fact, not live — so activating this the
              second you already know you&#39;ve won (or that you haven&#39;t) would be free
              money. It doesn&#39;t count until whoever runs the board confirms it, in person,
              before that game happens. Try to sneak one in afterward and they&#39;ll just say
              no.
            </p>
            <h3 style={{ marginTop: 18, lineHeight: 1.15 }}>Does it work with Leroy?</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              No. Nice try, though. Leroy takes exactly 5 points off you, boosted or not. Your
              desperate greed doesn&#39;t make him work any harder.
            </p>
            <div className="btn-row modal-close" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => setBoostHelpOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card trick-card" style={{ marginTop: 16 }}>
        {eventLive && leroyAllowed > 1 && (
          <div className="trick-charge-badge" title={`${leroyRemaining} of ${leroyAllowed} Leroys left this event`}>
            {leroyRemaining} left
          </div>
        )}
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h2 style={{ fontSize: 20, textAlign: "center" }}>Leroy</h2>
          <button
            type="button"
            className="card-help-btn"
            onClick={() => setLeroyHelpOpen(true)}
            aria-label="What is this?"
          >
            ?
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/leroy.png" alt="" style={{ width: 110, height: 110, objectFit: "contain" }} />
          <div className="hot-potato-card-label" style={{ marginTop: 4 }}>
            {leroyLabel}
          </div>
        </div>

        {!eventLive && (
          <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
            Nothing to send him after. No event, no victims, no fun.
          </p>
        )}

        {eventLive && leroyRemaining > 0 && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <label>Who&#39;s getting mugged?</label>
            <div className="chips" style={{ marginTop: 6, justifyContent: "center" }}>
              {tripPlayers
                .filter((p) => p.id !== me.id)
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`chip${target === p.id ? " selected" : ""}`}
                    onClick={() => setTarget(p.id)}
                  >
                    <PlayerAvatar iconId={p.icon_id} emoji={p.emoji} size={20} />
                    {p.name}
                  </button>
                ))}
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              {leroyAllowed > 1
                ? `${leroyRemaining} of ${leroyAllowed} left this event. Choose wisely, or don't — not my problem.`
                : "One shot, once, for the whole event. Choose wisely, or don't — not my problem."}
            </p>
            <div className="btn-row" style={{ marginTop: 10, justifyContent: "center" }}>
              <button className="btn btn-primary" disabled={!target || sending} onClick={handleSend}>
                {sending ? "Sending…" : "Send Leroy"}
              </button>
            </div>
            {sendError && <div className="banner-note error">{sendError}</div>}
          </div>
        )}

        {eventLive && mySends.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {mySends.map((s) => (
              <p className="muted" key={s.id} style={{ textAlign: "center", marginBottom: 8, fontSize: 13 }}>
                Sent after{" "}
                <strong>{players.find((p) => p.id === s.target_id)?.name || "someone"}</strong>.{" "}
                {!s.resolved_at
                  ? "Still waiting on him to earn his cut. They've no idea."
                  : !s.guessed_at
                  ? "He's struck. Any second now they'll find out — or won't."
                  : s.guess_correct
                  ? "They worked it out. Cost you 5 on top."
                  : "Job done. They never twigged it was you."}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="card trick-card" style={{ marginTop: 16 }}>
        {eventLive && jackpotAllowed > 1 && (
          <div
            className="trick-charge-badge"
            title={`${jackpotRemaining} of ${jackpotAllowed} Jackpots left this event`}
          >
            {jackpotRemaining} left
          </div>
        )}
        <div className="header-card-title-row">
          <span className="card-help-btn-spacer" aria-hidden="true" />
          <h2 style={{ fontSize: 20, textAlign: "center" }}>Jackpot</h2>
          <button
            type="button"
            className="card-help-btn"
            onClick={() => setBoostHelpOpen(true)}
            aria-label="What is this?"
          >
            ?
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/jackpot-icon.png" alt="" style={{ width: 110, height: 110, objectFit: "contain" }} />
          <div className="hot-potato-card-label" style={{ marginTop: 4 }}>
            Double or Nothing
          </div>
        </div>

        {!eventLive && (
          <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
            Nothing to double yet. No event, nothing to multiply.
          </p>
        )}

        {eventLive && jackpotRemaining > 0 && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <p className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
              Come first next game and it&#39;s doubled. Anything else and it scores nothing.
              {jackpotAllowed > 1
                ? ` ${jackpotRemaining} of ${jackpotAllowed} left this event.`
                : " One shot — don't fumble it."}
            </p>
            <button className="btn btn-primary" disabled={boosting} onClick={handleBoost}>
              {boosting ? "Activating…" : "Activate Jackpot"}
            </button>
            {boostError && <div className="banner-note error">{boostError}</div>}
          </div>
        )}

        {eventLive && myBoosts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {myBoosts.map((b) => (
              <p className="muted" key={b.id} style={{ textAlign: "center", marginBottom: 8, fontSize: 13 }}>
                {b.resolved_at
                  ? "Cashed in. All or nothing, however that round went for you."
                  : new Date(b.expires_at) <= now
                  ? b.confirmed_at
                    ? "Expired. You never played. Embarrassing."
                    : "Expired. Nobody confirmed it in time — wasted."
                  : b.confirmed_at
                  ? "Confirmed and live. Next game you play, it's everything or nothing."
                  : "Activated. Now go find whoever runs this and get them to confirm it — before your next game, not after."}
              </p>
            ))}
          </div>
        )}

        {isAdmin && eventLive && pendingConfirmations.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ fontSize: 13, textAlign: "center", marginBottom: 8 }}>
              Only confirm one of these if you&#39;re watching it happen right now — not after
              you already know how their next game went.
            </p>
            {pendingConfirmations.map((b) => {
              const p = players.find((pl) => pl.id === b.player_id);
              return (
                <div
                  className="btn-row"
                  style={{ justifyContent: "center", alignItems: "center", marginTop: 8 }}
                  key={b.id}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <PlayerAvatar iconId={p?.icon_id} emoji={p?.emoji} size={20} />
                    {p?.name || "?"}
                  </span>
                  <button
                    className="btn btn-primary"
                    disabled={confirmingId === b.id}
                    onClick={() => handleConfirm(b.id)}
                  >
                    {confirmingId === b.id ? "Confirming…" : "Confirm"}
                  </button>
                </div>
              );
            })}
            {confirmError && <div className="banner-note error">{confirmError}</div>}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 20 }}>Cheat Codes</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Hand these out however you like — each one's good for one shot per player, per
            event.
          </p>
          <form className="field" onSubmit={handleAddCode} style={{ marginTop: 10 }}>
            <label htmlFor="new-cheat-code">Add a code</label>
            <input
              id="new-cheat-code"
              type="text"
              placeholder="e.g. bananarama"
              maxLength={40}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={!newCode.trim() || addingCode}>
                {addingCode ? "Adding…" : "Add code"}
              </button>
            </div>
            {addCodeError && <div className="banner-note error">{addCodeError}</div>}
          </form>

          {cheatCodes.length > 0 ? (
            <div className="chips" style={{ marginTop: 14 }}>
              {cheatCodes.map((c) => (
                <span className="chip" key={c.id}>
                  {c.code}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              No codes yet.
            </p>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            {!confirmClear ? (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(true)}>
                Clear all codes
              </button>
            ) : (
              <>
                <span className="muted" style={{ fontSize: 13 }}>
                  Kill every code so none of them work anymore? Anyone who&#39;s already won a
                  charge off one keeps it.
                </span>
                <button className="btn btn-danger" disabled={clearing} onClick={handleClearCodes}>
                  {clearing ? "Clearing…" : "Yes, clear them"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <BottomNav session={session} me={me} hotPotatoEnabled={currentTrip?.hot_potato_enabled} />
    </div>
  );
}
