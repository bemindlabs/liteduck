import { useRef, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Bell, X, CheckCheck, Trash2, FileText, SquareTerminal, Monitor } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { notificationStore, markRead, markAllRead, clearAll } from "@/lib/notifications";
import type { Notification, NotificationType } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Type metadata
// ---------------------------------------------------------------------------

const TYPE_META: Record<
  NotificationType,
  { Icon: React.ElementType; colorClass: string; labelColor: string }
> = {
  system: {
    Icon: Monitor,
    colorClass: "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]",
    labelColor: "text-[var(--color-muted-foreground)]",
  },
  file: {
    Icon: FileText,
    colorClass: "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]",
    labelColor: "text-[var(--color-muted-foreground)]",
  },
  terminal: {
    Icon: SquareTerminal,
    colorClass: "bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]",
    labelColor: "text-[var(--color-muted-foreground)]",
  },
};

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------

function NotificationRow({ notification }: { notification: Notification }) {
  const meta = TYPE_META[notification.type];
  const { Icon } = meta;

  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        "hover:bg-(--color-accent)",
        !notification.read && "bg-(--color-secondary)",
      )}
      onClick={() => markRead(notification.id)}
    >
      {/* Icon badge */}
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          meta.colorClass,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      {/* Content */}
      <span className="flex flex-1 flex-col gap-0.5 min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-(--color-foreground)">
            {notification.title}
          </span>
          {!notification.read && (
            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-sidebar-primary)" />
          )}
        </span>
        <span className="line-clamp-2 text-xs text-(--color-muted-foreground)">
          {notification.message}
        </span>
        <span className={cn("text-[10px]", meta.labelColor)}>
          {relativeTime(notification.timestamp)}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// NotificationCenter
// ---------------------------------------------------------------------------

export function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const notifications = useSyncExternalStore(
    notificationStore.subscribe.bind(notificationStore),
    notificationStore.getSnapshot.bind(notificationStore),
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Outside click now handled by backdrop overlay

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Calculate panel position relative to the bell button
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  return (
    <>
      {/* Bell button */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center",
              "rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-destructive-foreground",
            )}
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Backdrop overlay */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />,
          document.body,
        )}

      {/* Dropdown panel — portaled to body to escape overflow-hidden */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notification center"
            className={cn(
              "fixed z-[9999] w-80 overflow-hidden",
              "rounded-xl border border-[var(--color-border)] shadow-2xl",
              "flex flex-col",
            )}
            style={{
              maxHeight: "420px",
              top: panelPos.top,
              right: panelPos.right,
              backgroundColor: "var(--color-popover)",
            }}
          >
            {/* Panel header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
              <span className="text-sm font-semibold text-(--color-foreground)">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 rounded-full bg-(--color-secondary) px-1.5 py-0.5 text-[10px] font-medium text-(--color-muted-foreground)">
                    {unreadCount} new
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead()}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-(--color-muted-foreground) transition-colors hover:bg-(--color-accent) hover:text-(--color-accent-foreground)"
                    title="Mark all read"
                  >
                    <CheckCheck className="h-3 w-3" />
                    All read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => clearAll()}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-(--color-muted-foreground) transition-colors hover:bg-(--color-destructive) hover:text-(--color-destructive)"
                    title="Clear all"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-(--color-muted-foreground) transition-colors hover:text-(--color-foreground)"
                  aria-label="Close notifications"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="flex flex-col overflow-y-auto p-1.5 gap-0.5">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <Bell className="h-8 w-8 text-(--color-muted-foreground)" />
                  <p className="text-sm text-(--color-muted-foreground)">No notifications</p>
                </div>
              ) : (
                notifications
                  .slice(0, 10)
                  .map((n) => <NotificationRow key={n.id} notification={n} />)
              )}
            </div>

            {/* Panel footer */}
            <div className="mt-auto border-t border-(--color-border) bg-(--color-muted)/30">
              <button
                onClick={() => {
                  setOpen(false);
                  void navigate(ROUTES.NOTIFICATIONS);
                }}
                className={cn(
                  "flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-semibold transition-colors text-primary hover:bg-(--color-accent) hover:text-primary",
                )}
              >
                View all notifications
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
