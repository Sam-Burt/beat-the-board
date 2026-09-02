"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const DEFAULT_TRIP_NAME = "Centre Parcs Trip";

export function useBoardData() {
  const [loading, setLoading] = useState(true);
  const [tripName, setTripName] = useState(DEFAULT_TRIP_NAME);
  const [players, setPlayers] = useState([]);
  const [events, setEvents] = useState([]);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const configured = !!supabase;

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    const [tripRes, playersRes, eventsRes] = await Promise.all([
      supabase.from("trip_settings").select("trip_name").eq("id", 1).maybeSingle(),
      supabase
        .from("players")
        .select("id, name, emoji, icon_id, user_id")
        .order("created_at", { ascending: true }),
      supabase
        .from("events")
        .select("id, name, event_date, note, ranking")
        .order("created_at", { ascending: false }),
    ]);
    if (tripRes.data?.trip_name) setTripName(tripRes.data.trip_name);
    if (playersRes.data) setPlayers(playersRes.data);
    if (eventsRes.data) {
      setEvents(
        eventsRes.data.map((e) => ({ ...e, date: e.event_date, ranking: e.ranking || [] }))
      );
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
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_settings" }, loadAll)
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
  // one — drives the "pick your profile icon" prompt.
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

  // Privileged actions (create/delete a player's real account) go through
  // API routes that run server-side with the service role key — the
  // browser never holds that key. We just attach the caller's own session
  // token so the route can verify they're really the admin.
  const callAdminApi = useCallback(
    async (path, body) => {
      setSaveError(null);
      if (!session) {
        setSaveError("You need to be signed in.");
        return { ok: false };
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
          setSaveError(json.error || "That didn't work.");
          return { ok: false };
        }
        return { ok: true, data: json };
      } catch (err) {
        console.error(err);
        setSaveError("Couldn't reach the server. Check your connection and try again.");
        return { ok: false };
      }
    },
    [session]
  );

  const createPlayerAccount = useCallback(
    ({ name, email, password, isSelf }) =>
      callAdminApi("/api/admin/create-player", { name, email, password, isSelf }),
    [callAdminApi]
  );

  const removePlayer = useCallback(
    (playerId) => callAdminApi("/api/admin/delete-player", { playerId }),
    [callAdminApi]
  );

  const updateMyIcon = useCallback(
    (iconId) => {
      if (!me) return;
      return guardWrite(() =>
        supabase.from("players").update({ icon_id: iconId }).eq("id", me.id)
      );
    },
    [me, guardWrite]
  );

  const saveEvent = useCallback(
    ({ name, date, note, ranking }) => {
      const trimmed = (name || "").trim();
      if (!trimmed || ranking.length < 2) return;
      return guardWrite(() =>
        supabase.from("events").insert({
          name: trimmed,
          event_date: date,
          note: (note || "").trim(),
          ranking,
        })
      );
    },
    [guardWrite]
  );

  const deleteEvent = useCallback(
    (id) => guardWrite(() => supabase.from("events").delete().eq("id", id)),
    [guardWrite]
  );

  const renameTrip = useCallback(
    (name) => {
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      return guardWrite(() =>
        supabase.from("trip_settings").update({ trip_name: trimmed }).eq("id", 1)
      );
    },
    [guardWrite]
  );

  return {
    configured,
    loading,
    tripName,
    players,
    events,
    session,
    isAdmin,
    me,
    saveError,
    createPlayerAccount,
    removePlayer,
    updateMyIcon,
    saveEvent,
    deleteEvent,
    renameTrip,
  };
}
