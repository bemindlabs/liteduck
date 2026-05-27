import { useEffect, useRef, useState } from "react";
import { notificationStore, type Notification } from "@/lib/notifications";

/**
 * Returns the latest notification message for screen reader announcement.
 * Subscribes to the notification store and returns a string whenever a new
 * unread notification arrives. The message auto-clears after 5 seconds so
 * the live region doesn't re-announce on re-render.
 */
export function useNotificationAnnouncer(): string {
  const [message, setMessage] = useState("");
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    function onNotify() {
      const all: Notification[] = notificationStore.getSnapshot();
      if (all.length === 0) return;
      const latest = all[0];
      if (latest.id === lastIdRef.current) return;
      if (latest.read) return;

      lastIdRef.current = latest.id;
      setMessage(`${latest.title}: ${latest.message}`);

      // Clear after 5s so re-renders don't re-announce
      setTimeout(() => setMessage(""), 5000);
    }

    const unsub = notificationStore.subscribe(onNotify);
    return unsub;
  }, []);

  return message;
}
