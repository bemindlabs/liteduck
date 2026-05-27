import { useState, useSyncExternalStore, useMemo } from "react";
import { Bell, Trash2, CheckCheck, Search, Github, Monitor, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { notificationStore, markRead, markAllRead, clearAll } from "@/lib/notifications";
import type { NotificationType } from "@/lib/notifications";

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<
  NotificationType,
  { Icon: React.ElementType; colorClass: string; label: string }
> = {
  github: {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    Icon: Github,
    colorClass: "bg-muted text-foreground",
    label: "GitHub",
  },
  system: {
    Icon: Monitor,
    colorClass: "bg-(--color-secondary) text-(--color-muted-foreground)",
    label: "System",
  },
};

export default function NotificationsPage() {
  const notifications = useSyncExternalStore(
    notificationStore.subscribe.bind(notificationStore),
    notificationStore.getSnapshot.bind(notificationStore),
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<NotificationType | "all">("all");

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const matchesSearch =
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.message.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === "all" || n.type === filterType;
      return matchesSearch && matchesFilter;
    });
  }, [notifications, searchQuery, filterType]);

  const selectedNotification = useMemo(() => {
    return notifications.find((n) => n.id === selectedId) ?? null;
  }, [notifications, selectedId]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-(--color-border) pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-(--color-foreground) sm:text-xl">
              Notifications
            </h1>
            <p className="hidden text-xs text-(--color-muted-foreground) sm:block">
              View and manage all your application alerts and messages.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead()}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mark all read</span>
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Clear all notifications?")) {
                  clearAll();
                  setSelectedId(null);
                }
              }}
              className="h-8 gap-1.5 text-xs font-semibold text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear all</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area — stacks on mobile, side-by-side on md+ */}
      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        {/* List panel — full width on mobile, fixed width on md+ */}
        <div
          className={cn(
            "flex flex-col gap-3 overflow-hidden",
            selectedId ? "hidden md:flex" : "flex",
            "w-full sm:w-72 md:w-80 md:shrink-0 md:border-r md:border-(--color-border) md:pr-4 lg:w-96 xl:w-[28rem]",
          )}
        >
          {/* Search & Filter */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted-foreground)" />
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-(--color-border) bg-(--color-background) py-1.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-(--color-ring)"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setFilterType("all")}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 min-h-[36px] text-[11px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors",
                  filterType === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-(--color-secondary) text-(--color-muted-foreground) hover:bg-primary/10 hover:text-primary",
                )}
              >
                All
              </button>
              {(["github", "system"] as NotificationType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 min-h-[36px] text-[11px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors",
                    filterType === type
                      ? "bg-primary text-primary-foreground"
                      : "bg-(--color-secondary) text-(--color-muted-foreground) hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  {TYPE_META[type].label}
                </button>
              ))}
            </div>
          </div>

          {/* List Scroll Area */}
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {filteredNotifications.length === 0 ? (
              <div className="mt-20 flex flex-col items-center justify-center gap-3 text-center opacity-40">
                <Inbox className="h-12 w-12" />
                <p className="text-sm font-medium">No notifications found</p>
              </div>
            ) : (
              filteredNotifications.map((n) => {
                const meta = TYPE_META[n.type];
                const Icon = meta.Icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      setSelectedId(n.id);
                      markRead(n.id);
                    }}
                    className={cn(
                      "group relative flex items-start gap-3 rounded-xl p-3 text-left transition-all",
                      selectedId === n.id
                        ? "bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                        : "hover:bg-(--color-accent)",
                      !n.read &&
                        "after:absolute after:right-3 after:top-3 after:h-2 after:w-2 after:rounded-full after:bg-primary",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm transition-transform group-hover:scale-110",
                        meta.colorClass,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={cn(
                          "truncate text-sm font-semibold",
                          selectedId === n.id ? "text-primary" : "text-(--color-foreground)",
                        )}
                      >
                        {n.title}
                      </h3>
                      <p className="line-clamp-1 text-xs text-(--color-muted-foreground)">
                        {n.message}
                      </p>
                      <span className="mt-1 block text-[11px] sm:text-[10px] font-medium text-(--color-muted-foreground)/60">
                        {new Date(n.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel — hidden on mobile when no selection, full width on mobile when selected */}
        <div
          className={cn(
            "flex flex-1 flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-card) shadow-inner",
            selectedId ? "flex" : "hidden md:flex",
          )}
        >
          {selectedNotification ? (
            <div className="flex h-full flex-col overflow-hidden">
              {/* Detail Header */}
              <div className="flex items-start justify-between border-b border-(--color-border) p-4 sm:p-6">
                {/* Back button — mobile only */}
                <button
                  onClick={() => setSelectedId(null)}
                  className="mr-3 mt-1 shrink-0 rounded-lg p-1.5 text-(--color-muted-foreground) hover:bg-(--color-accent) md:hidden"
                  aria-label="Back to list"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl shadow-md",
                      TYPE_META[selectedNotification.type].colorClass,
                    )}
                  >
                    {(() => {
                      const Icon = TYPE_META[selectedNotification.type].Icon;
                      return <Icon className="h-6 w-6" />;
                    })()}
                  </div>
                  <div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] sm:text-[10px] font-bold uppercase tracking-widest text-primary">
                      {TYPE_META[selectedNotification.type].label}
                    </span>
                    <h2 className="mt-1 text-2xl font-bold text-(--color-foreground)">
                      {selectedNotification.title}
                    </h2>
                    <p className="text-sm text-(--color-muted-foreground)">
                      {new Date(selectedNotification.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto p-4 leading-relaxed sm:p-6 md:p-8">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap text-(--color-foreground) text-lg leading-relaxed">
                    {selectedNotification.message}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center opacity-30">
              <Bell className="h-20 w-20" />
              <div>
                <p className="text-xl font-bold">No Notification Selected</p>
                <p className="text-sm">Select an item from the list to view its full details.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
