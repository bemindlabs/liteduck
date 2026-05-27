import { cn } from "@/lib/utils";

// ── Skeleton primitives ──────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

/** Animated pulse skeleton block. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-[var(--color-muted)]", className)} />;
}

/** Skeleton line of text. */
export function SkeletonText({ className }: SkeletonProps) {
  return <Skeleton className={cn("h-3.5 w-full rounded", className)} />;
}

/** Skeleton circle (avatar). */
export function SkeletonCircle({ className }: SkeletonProps) {
  return <Skeleton className={cn("h-8 w-8 rounded-full", className)} />;
}

// ── Composed skeletons ───────────────────────────────────────────────────────

/** Skeleton for a card with title + 2 lines + badge row. */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5",
        className,
      )}
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}

/** Skeleton for a list item row. */
export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5", className)}>
      <SkeletonCircle className="h-6 w-6" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <Skeleton className="h-5 w-14 rounded-full" />
    </div>
  );
}

/** Skeleton for a Kanban column. */
export function SkeletonKanbanColumn({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-sidebar)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--color-border)]">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="ml-auto h-5 w-5 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 p-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

/** Skeleton for the Kanban board (3 columns). */
export function SkeletonKanbanBoard({ columns = 3 }: { columns?: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonKanbanColumn key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a settings section. */
export function SkeletonSettingsSection() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-5">
      <div className="border-b border-[var(--color-border)] pb-3 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for a chat message bubble. */
export function SkeletonChatBubble({ isOwn = false }: { isOwn?: boolean }) {
  return (
    <div className={cn("flex w-full gap-2", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && <SkeletonCircle className="h-6 w-6" />}
      <div className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}>
        {!isOwn && <Skeleton className="h-3 w-16" />}
        <Skeleton className={cn("h-12 rounded-lg", isOwn ? "w-40" : "w-52")} />
        <Skeleton className="h-2.5 w-10" />
      </div>
    </div>
  );
}

/** Skeleton for a row of small metric cards. */
export function SkeletonMetricsRow() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}

// ── Full page loading ────────────────────────────────────────────────────────

/** Centered spinner for full-page loading states. */
export function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
        <span className="text-xs text-[var(--color-muted-foreground)]">Loading...</span>
      </div>
    </div>
  );
}

/** Inline spinner for buttons and small areas. */
export function InlineSpinner({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]",
        className,
      )}
    />
  );
}
