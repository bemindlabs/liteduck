/**
 * SplitTerminal
 *
 * Renders a tree of terminal panes that can be split horizontally or
 * vertically up to a maximum of 4 panes. Each leaf pane is an independent
 * TerminalTabs instance (its own useTerminal() hook instance).
 *
 * Uses react-resizable-panels v4 API (Group / Panel / Separator).
 */

import { useCallback, useState } from "react";
import { Group, Panel, Separator, type GroupProps, type Layout } from "react-resizable-panels";
import { PanelRight, PanelBottom, X, Plus } from "lucide-react";
import TerminalTabs from "@/components/TerminalTabs";
import type { UseTerminalReturn } from "@/hooks/useTerminal";
import { cn } from "@/lib/utils";

// ── Tree types ────────────────────────────────────────────────────────────────

export type SplitDirection = "horizontal" | "vertical";

/** A leaf pane — holds one useTerminal() instance. */
export interface LeafPane {
  kind: "leaf";
  id: string;
  terminal: UseTerminalReturn;
}

/** A branch pane — holds exactly two children (leaf or branch). */
export interface BranchPane {
  kind: "branch";
  id: string;
  direction: SplitDirection;
  children: [PaneNode, PaneNode];
}

export type PaneNode = LeafPane | BranchPane;

// ── Callbacks supplied by the parent ─────────────────────────────────────────

export interface SplitCallbacks {
  /** Look up the live terminal for a pane (avoids stale closure in tree state). */
  getTerminal: (paneId: string) => UseTerminalReturn | null;
  /** Split a leaf pane in the given direction. */
  onSplit: (paneId: string, direction: SplitDirection) => void;
  /** Remove a leaf pane (sibling takes the full space). */
  onUnsplit: (paneId: string) => void;
  /** How many leaf panes currently exist (split disabled at 4). */
  leafCount: number;
}

// ── ResizeHandle (Separator wrapper) ─────────────────────────────────────────

interface ResizeHandleProps {
  direction: SplitDirection;
}

function ResizeHandle({ direction }: ResizeHandleProps) {
  const isHorizontal = direction === "horizontal";

  return (
    <Separator
      className={cn(
        "group relative z-10 flex shrink-0 items-center justify-center",
        "bg-[var(--color-background)] outline-none",
        isHorizontal ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize",
      )}
      aria-label={isHorizontal ? "Resize panels horizontally" : "Resize panels vertically"}
    >
      {/* Visual bar. react-resizable-panels v4 only exposes `data-separator`
          (no per-drag state attribute), so we lean on `group-hover` and the
          `group-active` pseudo — which fires while the pointer is held on the
          Separator during a drag — for the emphasised state. */}
      <div
        className={cn(
          "rounded-full transition-all duration-150",
          "bg-[var(--color-border)]",
          isHorizontal
            ? ["h-12 w-[2px]", "group-hover:w-[4px]", "group-active:w-[4px]"]
            : ["h-[2px] w-12", "group-hover:h-[4px]", "group-active:h-[4px]"],
          "group-hover:bg-[var(--color-sidebar-primary)]",
          "group-active:bg-[var(--color-sidebar-primary)]",
        )}
      />
    </Separator>
  );
}

// ── LeafPaneView ──────────────────────────────────────────────────────────────

interface LeafPaneViewProps {
  pane: LeafPane;
  callbacks: SplitCallbacks;
  isOnly: boolean;
  /** Bumped whenever the split layout changes, forcing a re-fit of xterm. */
  layoutSignal: number;
}

function LeafPaneView({ pane, callbacks, isOnly, layoutSignal }: LeafPaneViewProps) {
  // Always look up the live terminal from the pool — the tree state holds a
  // stale reference captured at creation time.
  const terminal = callbacks.getTerminal(pane.id) ?? pane.terminal;
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    closeTab,
    writeToSession,
    resizeSession,
    registerXterm,
    unregisterXterm,
  } = terminal;

  const hasTerminals = tabs.length > 0;
  const canSplit = callbacks.leafCount < 4;

  // Pane action buttons rendered inline in the tab bar's actions slot.
  const paneActions = (
    <div className="flex items-center gap-0.5" aria-label="Pane actions">
      {/* App-level splits */}
      {canSplit && (
        <>
          <button
            onClick={() => callbacks.onSplit(pane.id, "horizontal")}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded",
              "text-[var(--color-muted-foreground)]",
              "hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
              "transition-colors",
            )}
            title="New pane right"
            aria-label="Split pane horizontally"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => callbacks.onSplit(pane.id, "vertical")}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded",
              "text-[var(--color-muted-foreground)]",
              "hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
              "transition-colors",
            )}
            title="New pane down"
            aria-label="Split pane vertically"
          >
            <PanelBottom className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {!isOnly && (
        <button
          onClick={() => callbacks.onUnsplit(pane.id)}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded",
            "text-[var(--color-muted-foreground)]",
            "hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]",
            "transition-colors",
          )}
          title="Close pane"
          aria-label="Close pane"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="split-pane relative flex h-full flex-col overflow-hidden">
      {/* Terminal content */}
      {hasTerminals ? (
        <TerminalTabs
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={closeTab}
          onInput={writeToSession}
          onResize={resizeSession}
          onRegisterXterm={registerXterm}
          onUnregisterXterm={unregisterXterm}
          actions={paneActions}
          layoutSignal={layoutSignal}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-[var(--color-background)] px-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>Empty pane.</span>
            <button
              onClick={() => void terminal.createTab("Terminal 1", "", [])}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
                "text-[var(--color-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              New Terminal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PaneTreeView ──────────────────────────────────────────────────────────────

interface PaneTreeViewProps {
  node: PaneNode;
  callbacks: SplitCallbacks;
  isOnly: boolean;
  /** Bumped whenever any split layout changes, forcing leaf panes to re-fit. */
  layoutSignal: number;
  /** Notify the root that this group's layout settled (drag/split/unsplit). */
  onLayoutChanged: () => void;
}

function PaneTreeView({
  node,
  callbacks,
  isOnly,
  layoutSignal,
  onLayoutChanged,
}: PaneTreeViewProps) {
  if (node.kind === "leaf") {
    return (
      <LeafPaneView
        pane={node}
        callbacks={callbacks}
        isOnly={isOnly}
        layoutSignal={layoutSignal}
      />
    );
  }

  const [childA, childB] = node.children;

  const orientation: GroupProps["orientation"] =
    node.direction === "horizontal" ? "horizontal" : "vertical";

  // `onLayoutChanged` fires after a drag completes (pointer released) — bubble
  // it up so every visible pane re-fits to its final size.
  const handleLayoutChanged = (_layout: Layout) => onLayoutChanged();

  return (
    <Group orientation={orientation} className="h-full w-full" onLayoutChanged={handleLayoutChanged}>
      <Panel defaultSize={50} minSize={20} className="overflow-hidden">
        <PaneTreeView
          node={childA}
          callbacks={callbacks}
          isOnly={false}
          layoutSignal={layoutSignal}
          onLayoutChanged={onLayoutChanged}
        />
      </Panel>

      <ResizeHandle direction={node.direction} />

      <Panel defaultSize={50} minSize={20} className="overflow-hidden">
        <PaneTreeView
          node={childB}
          callbacks={callbacks}
          isOnly={false}
          layoutSignal={layoutSignal}
          onLayoutChanged={onLayoutChanged}
        />
      </Panel>
    </Group>
  );
}

// ── SplitTerminal (public) ────────────────────────────────────────────────────

export interface SplitTerminalProps {
  root: PaneNode;
  callbacks: SplitCallbacks;
}

/** Stable signature of the tree's leaf arrangement (depth-first, with depth). */
function leafShape(node: PaneNode, depth = 0): string {
  if (node.kind === "leaf") return `${depth}:${node.id}`;
  return `${leafShape(node.children[0], depth + 1)},${leafShape(node.children[1], depth + 1)}`;
}

/**
 * Top-level split terminal view. Pass in the root PaneNode and callbacks.
 *
 * The actual useTerminal() instances live in the parent (TerminalPage) so they
 * survive tree restructuring (split / unsplit operations).
 */
export default function SplitTerminal({ root, callbacks }: SplitTerminalProps) {
  const isOnly = root.kind === "leaf";

  // A monotonically increasing signal that forces every visible TerminalPane to
  // re-fit xterm. We bump it whenever the layout settles — either because the
  // split tree was restructured (split/unsplit changes a pane's flex size, and
  // the ResizeObserver alone can miss the transition during the same render
  // frame) or because the user finished dragging a Separator (`onLayoutChanged`).
  const [layoutSignal, setLayoutSignal] = useState(0);
  const bumpLayout = useCallback(() => setLayoutSignal((n) => n + 1), []);

  // The leaf-id structure encodes both the count and the arrangement of panes;
  // any split/unsplit changes this string, so re-fit when it does. Computed
  // inline (rather than importing collectLeafIds) to avoid a circular import,
  // since splitTerminalUtils imports its types from this module.
  const treeShape = leafShape(root);
  const [prevShape, setPrevShape] = useState(treeShape);
  if (treeShape !== prevShape) {
    setPrevShape(treeShape);
    setLayoutSignal((n) => n + 1);
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <PaneTreeView
        node={root}
        callbacks={callbacks}
        isOnly={isOnly}
        layoutSignal={layoutSignal}
        onLayoutChanged={bumpLayout}
      />
    </div>
  );
}

// ── Tree helpers (used by TerminalPage) ───────────────────────────────────────
