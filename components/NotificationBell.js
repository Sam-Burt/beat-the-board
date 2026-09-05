"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// A small floating bell shown on every signed-in-player page (see
// app/page.js, app/missions/page.js, app/profile/page.js, and
// app/hot-potato/page.js), so a missed/misread/misclicked push alert can
// always be looked back up — covers both secret missions and Hot Potato
// passes (see the "kind" column on the notifications table).
export default function NotificationBell({ me }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!supabase || !me) return;
    let cancelled = false;

    function load() {
      supabase
        .from("notifications")
        .select("id, kind, title, body, created_at, read_at")
        .eq("player_id", me.id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => {
          if (!cancelled && data) setItems(data);
        });
    }
    load();

    const channel = supabase
      .channel(`notifications-${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `player_id=eq.${me.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [me]);

  if (!me) return null;

  const unread = items.filter((n) => !n.read_at).length;

  async function markAllRead() {
    if (!supabase) return;
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!unreadIds.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
  }

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen) markAllRead();
      return !wasOpen;
    });
  }

  return (
    <>
      <button type="button" className="notif-bell" onClick={toggle} aria-label="Notifications">
        🔔
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <h3>Notifications</h3>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {items.length === 0 ? (
            <div className="empty">Nothing yet.</div>
          ) : (
            <div className="mission-list notif-list">
              {items.map((n) => (
                <div className="mission-item" key={n.id}>
                  <div className="mission-date">
                    {new Date(n.created_at).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="mission-text">
                    <strong>{n.title}</strong>
                    <br />
                    {n.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
