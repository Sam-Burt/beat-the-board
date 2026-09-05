"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

export function useBoardData() {
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [players, setPlayers] = useState([]);
  const [rosterIds, setRosterIds] = useState([]); // player_id[] for the current trip
  const [events, setEvents] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [trophies, setTrophies] = useState([]);
  const [missionTemplates, setMissionTemplates] = useState([]);
  const [scheduledMissions, setScheduledMissions] = useState([]);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const configured = !!supabase;

  // The most recently created trip is "the current one" — shown on the
  // board, logged rounds and point adjustments attach to it, and its
  // roster is who shows up. Once it's finalized it just stays visible
  // (frozen) as the last result until the admin starts a new one.
  const currentTrip = trips[0] || null;

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    const [playersRes, tripsRes, trophiesRes, templatesRes, scheduledRes] = await Promise.all([
      supabase
        .from("players")
        .select("id, name, emoji, icon_id, user_id, username")
        .order("created_at", { ascending: true }),
      supabase.from("trips").select("*").order("created_at", { ascending: false }),
      supabase
        .from("trophies")
        .select("id, trip_id, player_id, trip_name, badge_id, points, starts_on, ends_on, awarded_at")
        .order("awarded_at", { ascending: false }),
      // These two are admin-only per RLS — a non-admin's query just comes
      // back empty, which is fine since only the admin-facing Missions UI
      // reads this state.
      supabase.from("mission_templates").select("id, title, text, created_at").order("created_at", { ascending: false }),
      supabase
        .from("scheduled_missions")
        .select("id, player_id, title, text, random, scheduled_for, sent_at, created_at")
        .is("sent_at", null)
        .order("scheduled_for", { ascending: true }),
    ]);
    if (playersRes.data) setPlayers(playersRes.data);
    if (tripsRes.data) setTrips(tripsRes.data);
    if (trophiesRes.data) setTrophies(trophiesRes.data);
    if (templatesRes.data) setMissionTemplates(templatesRes.data);
    if (scheduledRes.data) setScheduledMissions(scheduledRes.data);

    const tripId = tripsRes.data?.[0]?.id;
    if (tripId) {
      const [rosterRes, eventsRes, adjustmentsRes] = await Promise.all([
        supabase.from("trip_players").select("player_id").eq("trip_id", tripId),
        supabase
          .from("events")
          .select("id, name, event_date, note, ranking")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false }),
        supabase
          .from("point_adjustments")
          .select("id, player_id, amount, note, created_at")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false }),
      ]);
      setRosterIds((rosterRes.data || []).map((r) => r.player_id));
      setEvents(
        (eventsRes.data || []).map((e) => ({ ...e, date: e.event_date, ranking: e.ranking || [] }))
      );
      setAdjustments(adjustmentsRes.data || []);
    } else {
      setRosterIds([]);
      setEvents([]);
      setAdjustments([]);
    }
    setLoading(false);
  }, []);

  // Initial load + realtime subscriptions so every open tab reflects
  // whatever the admin just saved, the same way the old artifact did.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    loadAll();

    const channel = supabase
      .channel("beat-the-board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_players" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "point_adjustments" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "trophies" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_templates" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_missions" }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  // Auth session + admin membership check.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // The signed-in visitor's own player row, if their account is linked to
  // one — drives the "pick your profile icon" prompt and the profile page.
  const me = useMemo(() => {
    if (!session) return null;
    return players.find((p) => p.user_id === session.user.id) || null;
  }, [players, session]);

  const guardWrite = useCallback(async (fn) => {
    setSaveError(null);
    try {
      const { error } = await fn();
      if (error) {
        console.error(error);
        setSaveError(error.message || "Couldn't save that last change.");
        return false;
      }
      return true;
    } catch (err) {
      console.error(err);
      setSaveError("Couldn't save that last change. Check your connection and try again.");
      return false;
    }
  }, []);

  // Privileged actions go through API routes that run server-side with the
  // service role key — the browser never holds that key. We just attach
  // the caller's own session token so the route can verify they're really
  // the admin.
  const callAdminApi = useCallback(
    async (path, body) => {
      setSaveError(null);
      if (!session) {
        const message = "You need to be signed in.";
        setSaveError(message);
        return { ok: false, error: message };
      }
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message = json.error || "That didn't work.";
          setSaveError(message);
          return { ok: false, error: message };
        }
        return { ok: true, data: json };
      } catch (err) {
        console.error(err);
        const message = "Couldn't reach the server. Check your connection and try again.";
        setSaveError(message);
        return { ok: false, error: message };
      }
    },
    [session]
  );

  const createPlayerAccount = useCallback(
    ({ name, username, password, isSelf }) =>
      callAdminApi("/api/admin/create-player", { name, username, password, isSelf }),
    [callAdminApi]
  );

  const removePlayer = useCallback(
    (playerId) => callAdminApi("/api/admin/delete-player", { playerId }),
    [callAdminApi]
  );

  const sendMission = useCallback(
    ({ playerId, text, title }) => callAdminApi("/api/admin/send-mission", { playerId, text, title }),
    [callAdminApi]
  );

  // Server picks a random task from the pool — the admin never sees which
  // one it was, only that it was sent.
  const sendRandomMission = useCallback(
    ({ playerId }) => callAdminApi("/api/admin/send-mission", { playerId, random: true }),
    [callAdminApi]
  );

  const addMissionTemplate = useCallback(
    ({ title, text }) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      return guardWrite(() =>
        supabase.from("mission_templates").insert({ title: (title || "").trim() || null, text: trimmed })
      );
    },
    [guardWrite]
  );

  const deleteMissionTemplate = useCallback(
    (id) => guardWrite(() => supabase.from("mission_templates").delete().eq("id", id)),
    [guardWrite]
  );

  // Queues a mission to go out later — either a specific title/text, or
  // random=true to have the pool decide at the moment it actually fires
  // (see app/api/process-due/route.js). scheduledFor is an ISO timestamp;
  // the admin picks it but the app never shows it back once queued, so in
  // practice they don't have it memorized either.
  const scheduleMission = useCallback(
    ({ playerId, title, text, random, scheduledFor }) => {
      if (!playerId || !scheduledFor) return;
      if (!random && !(text || "").trim()) return;
      return guardWrite(() =>
        supabase.from("scheduled_missions").insert({
          player_id: playerId,
          title: random ? null : (title || "").trim() || null,
          text: random ? null : (text || "").trim(),
          random: !!random,
          scheduled_for: scheduledFor,
        })
      );
    },
    [guardWrite]
  );

  const cancelScheduledMission = useCallback(
    (id) => guardWrite(() => supabase.from("scheduled_missions").delete().eq("id", id)),
    [guardWrite]
  );

  // Opportunistic "is anything due yet" check — same idea as the trip
  // auto-finalize effect below, just not admin-gated, since any signed-in
  // player's device happening to have the app open is what makes a
  // scheduled mission's "hidden" send time actually arrive close to on
  // time. Fires once per session per page load.
  const processedDueRef = useRef(false);
  useEffect(() => {
    if (!session || processedDueRef.current) return;
    processedDueRef.current = true;
    callAdminApi("/api/process-due", {});
  }, [session, callAdminApi]);

  const startHotPotato = useCallback(
    () => callAdminApi("/api/admin/start-hot-potato", {}),
    [callAdminApi]
  );

  const passHotPotato = useCallback(
    ({ toPlayerId, note }) => callAdminApi("/api/hot-potato/pass", { toPlayerId, note }),
    [callAdminApi]
  );

  const createTrip = useCallback(
    ({ name, badgeId, startsOn, endsOn, deadline, playerIds, hotPotatoEnabled }) =>
      callAdminApi("/api/admin/create-trip", {
        name,
        badgeId,
        startsOn,
        endsOn,
        deadline,
        playerIds,
        hotPotatoEnabled,
      }),
    [callAdminApi]
  );

  const endTripNow = useCallback(() => callAdminApi("/api/admin/finalize-trip", {}), [callAdminApi]);

  const declareTripWinner = useCallback(
    (winnerId) => callAdminApi("/api/admin/declare-trip-winner", { winnerId }),
    [callAdminApi]
  );

  // Once the current trip's deadline has passed, finalize it automatically
  // next time an admin has the app open — no cron job needed for a small
  // family app like this. (The admin also has a manual "End trip now"
  // button for wrapping up early, regardless of the deadline — same
  // finalize-trip route either way.) Guarded so it only ever fires once per
  // trip per page load, even though this effect re-runs on every realtime
  // refresh.
  const autoFinalizedTripId = useRef(null);
  useEffect(() => {
    if (!isAdmin || !currentTrip || currentTrip.status !== "active" || !currentTrip.deadline) return;
    if (new Date(currentTrip.deadline).getTime() > Date.now()) return;
    if (autoFinalizedTripId.current === currentTrip.id) return;
    autoFinalizedTripId.current = currentTrip.id;
    callAdminApi("/api/admin/finalize-trip", {});
  }, [isAdmin, currentTrip, callAdminApi]);

  const updateMyIcon = useCallback(
    (iconId) => {
      if (!me) return;
      return guardWrite(() =>
        supabase.from("players").update({ icon_id: iconId }).eq("id", me.id)
      );
    },
    [me, guardWrite]
  );

  // The player's display name shown on the board — separate from their
  // username (which they sign in with and can't change themselves; that's
  // set once by the admin when the account is created). Any signed-in
  // player can rename themselves via the RLS policy that lets a player
  // update their own row, same as the icon above — no admin API needed.
  const updateMyName = useCallback(
    (name) => {
      const trimmed = (name || "").trim();
      if (!me || !trimmed) return;
      return guardWrite(() =>
        supabase.from("players").update({ name: trimmed }).eq("id", me.id)
      );
    },
    [me, guardWrite]
  );

  const saveEvent = useCallback(
    ({ name, date, note, ranking }) => {
      const trimmed = (name || "").trim();
      if (!trimmed || ranking.length < 2 || !currentTrip) return;
      return guardWrite(() =>
        supabase.from("events").insert({
          trip_id: currentTrip.id,
          name: trimmed,
          event_date: date,
          note: (note || "").trim(),
          ranking,
        })
      );
    },
    [guardWrite, currentTrip]
  );

  const deleteEvent = useCallback(
    (id) => guardWrite(() => supabase.from("events").delete().eq("id", id)),
    [guardWrite]
  );

  // A free-form point award (or deduction, with a negative amount) — on
  // top of automatic per-round scoring. Same RLS-gated direct-write
  // pattern as saveEvent (admins can write point_adjustments directly, no
  // API route needed).
  const addPointAdjustment = useCallback(
    ({ playerId, amount, note }) => {
      const value = Number(amount);
      if (!playerId || !Number.isFinite(value) || value === 0 || !currentTrip) return;
      return guardWrite(() =>
        supabase.from("point_adjustments").insert({
          trip_id: currentTrip.id,
          player_id: playerId,
          amount: value,
          note: (note || "").trim(),
        })
      );
    },
    [guardWrite, currentTrip]
  );

  // Editing the CURRENT event's own details (name, badge, date window,
  // deadline) — separate from createTrip, which starts a brand new one.
  // Lives in the Event panel ("Edit event"), same direct-client-write +
  // RLS pattern as everything else an admin can change without an API
  // route (the "trips write for admins" policy covers this).
  const updateTripDetails = useCallback(
    ({ name, badgeId, startsOn, endsOn, deadline, hotPotatoEnabled }) => {
      const trimmed = (name || "").trim();
      if (!trimmed || !currentTrip) return;
      return guardWrite(() =>
        supabase
          .from("trips")
          .update({
            name: trimmed,
            badge_id: badgeId ?? null,
            starts_on: startsOn || null,
            ends_on: endsOn || null,
            deadline: deadline || null,
            hot_potato_enabled: !!hotPotatoEnabled,
          })
          .eq("id", currentTrip.id)
      );
    },
    [guardWrite, currentTrip]
  );

  const rosterIdSet = useMemo(() => new Set(rosterIds), [rosterIds]);
  const tripPlayers = useMemo(
    () => players.filter((p) => rosterIdSet.has(p.id)),
    [players, rosterIdSet]
  );

  // How many trips each player has won, across all of history — this is
  // what drives the crown (+ counter) next to a name on the leaderboard.
  const trophyCounts = useMemo(() => {
    const counts = {};
    trophies.forEach((t) => {
      counts[t.player_id] = (counts[t.player_id] || 0) + 1;
    });
    return counts;
  }, [trophies]);

  const myTrophies = useMemo(() => {
    if (!me) return [];
    return trophies.filter((t) => t.player_id === me.id);
  }, [trophies, me]);

  return {
    configured,
    loading,
    tripName: currentTrip?.name || "",
    currentTrip,
    players,
    tripPlayers,
    rosterIdSet,
    events,
    adjustments,
    trophies,
    trophyCounts,
    myTrophies,
    missionTemplates,
    scheduledMissions,
    session,
    isAdmin,
    me,
    saveError,
    createPlayerAccount,
    removePlayer,
    sendMission,
    sendRandomMission,
    addMissionTemplate,
    deleteMissionTemplate,
    scheduleMission,
    cancelScheduledMission,
    startHotPotato,
    passHotPotato,
    updateMyIcon,
    updateMyName,
    saveEvent,
    deleteEvent,
    addPointAdjustment,
    updateTripDetails,
    createTrip,
    endTripNow,
    declareTripWinner,
  };
}
