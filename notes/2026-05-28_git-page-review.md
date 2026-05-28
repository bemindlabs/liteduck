# Git page view review — 2026-05-28

## Summary

Total surface under review: ~1,007 LoC across `GitPage.tsx` (283) + `git/ChangesTab.tsx` (178) + `git/HistoryTab.tsx` (245) + `git/WorktreesTab.tsx` (491) + `git/shared.tsx` (93). IPC wiring is clean (every `invoke()` matches a registered handler) and the code is well-structured, but **the page is fundamentally mis-fit for the SidePanel slot it now lives in** (180–600px column). Three nested horizontal scopes (repo tabs → view tabs → split panes with their own resize handles) collapse below ~400px. Top recommendation: split it into a slim Source Control view in the side panel and promote the full GitPage to an editor-area tab.

## Findings by tab

### Overall (GitPage.tsx shell)

- **P0 — Triple-nested horizontal regions in a ≤600px column.** `GitPage.tsx:159-281` builds: header row + repo tab strip (`role="tablist"`, line 187) + view tab strip (line 228) + a `react-resizable-panels` `Group` inside each tab (50/50 default split). At `SidePanel` `MIN_WIDTH=180` (`SidePanel.tsx:33`), that gives each Panel ~75–80px after the rail/padding subtracts — unusable. Even at 400px the diff column is 180px before chrome.
- **P0 — Multi-repo scan runs on every workspace mount with no caching.** `GitPage.tsx:68-95` triggers `gitScanRepos` + per-repo `gitStatus` (`checkDirtyStatus`, line 32–51) every time `workspace` changes. There's no in-memory cache, no TTL, no debounce. Combined with the `window.focus` listener (line 110–113) bumping `refreshSignal`, every alt-tab back into the app re-runs `gitLog`, `gitDiffWorking`, `gitWorktreeList`, and `gitCurrentBranch` for the active repo — N+1 on every focus.
- **P1 — `window.focus` refresh fires even when the Git panel isn't visible.** `GitPage.tsx:110-113` attaches a global focus listener that bumps `refreshSignal` regardless of `activePanel`. Because GitPage is lazy-loaded but kept mounted while the panel is "git", a user with the panel toggled to "files" still pays for nothing — but once visited, GitPage stays mounted invisibly if user later switches panels back. Verify with React DevTools; if Suspense unmounts on panel change this is moot.
- **P1 — Dirty-status loop is N (one `gitStatus` per repo) without cancellation.** `checkDirtyStatus` (line 32–51) issues `Promise.allSettled` over every scanned repo. On a workspace with 20+ submodules this is 20 IPC round-trips on each rescan. No `AbortController`, so a fast workspace switch races stale results into `setDirtyRepos`.
- **P1 — Repo tab strip uses `overflow-x-auto` (line 189).** Works on desktop but is the third horizontal scroll surface on the page; at 240px the active branch label `(feat/long-branch-name)` plus dirty dot easily overflows. No truncation on `repo.name`.
- **P2 — `selectedFile` / `selectedCommit` state isn't reset on repo switch.** When switching repos via the tab strip (line 197–200), `ChangesTab`/`HistoryTab` keys are unchanged → they keep their internal `selectedFile`, `selectedCommit`, `diff`, etc. They re-load via `refreshSignal`, but the user briefly sees the old commit's diff with the new commit list. Add `key={selectedRepo.path}` on the tab containers, or clear state in a `useEffect` on `repoPath`.
- **P2 — No keyboard nav between repo tabs / view tabs.** Tabs have `role="tab"` and `aria-selected` but no `onKeyDown` for arrow-key navigation, no `tabIndex` management, and no `role="tabpanel"` wrapper. Screen-reader-only — the visual tab metaphor isn't operable from the keyboard the way WAI-ARIA expects.
- **P2 — `repoError` text fragment "No git repositories found in this workspace."** appears twice (line 78 and line 125). Extract a constant.

### ChangesTab

- **P0 — `Group`/`Panel` split inside a narrow side panel.** `ChangesTab.tsx:76-176` uses a 50/50 horizontal split with `minSize={20}` left and `minSize={30}` right. At 300px usable width, that's 60/90px — file names and diff are both clipped. The diff side renders a `<table>` with `LineNo` cells fixed at `w-10` × 2 + origin char + content — total minimum ~110px before any code is visible. Vertically stacking under ~500px would be far more readable.
- **P1 — No virtualization on the file list.** `StatusGroup` (in `shared.tsx:59-93`) renders every file in five groups. A workspace mid-rebase with 500 modified files renders 500 button nodes. Use `@tanstack/react-virtual` (already common in shadcn projects) for lists > 100.
- **P1 — No stage / unstage / discard actions.** The redesign brief calls out the missing "VS Code Source Control" inline actions (stage hunk, stage file, discard, commit message + commit button). Currently this is read-only: status + diff display only. This is the single biggest functional gap for the sidebar slot.
- **P1 — `gitDiffWorking` fetches diff for the entire repo on every load, then filters client-side via `<DiffViewer filterPath={selectedFile} />`.** `ChangesTab.tsx:41`. On a large change set this transfers tens of MB of diff data over IPC just to render one file. Move filtering server-side (new `git_diff_working_file(repo, path)` command) or at minimum lazily fetch the per-file diff on selection.
- **P2 — Empty state copy "Working tree clean" (line 111) doesn't match the rest of the codebase's tone.** Minor.
- **P2 — Auto-select first file (line 45–55) reads back into `setSelectedFile` from inside a Promise — fine on its own, but combined with `refreshSignal` it can fight a user's manual selection mid-refresh.** Guard with `if (prev) return prev`.

### HistoryTab

- **P0 — Same split-pane issue as ChangesTab.** `HistoryTab.tsx:142-243`. Plus the `CommitRow` (line 38–75) embeds `GraphCell` (an SVG of indeterminate width set by `(row.maxLane + 1) * 14 + 8` — `GitGraph.tsx:8`) inside a row whose parent is already a 25%-min panel. With a busy merge history (5+ lanes), the graph alone consumes 80–100px and the message truncates to nothing.
- **P0 — `useGitGraph` recomputes on every render where `commits` reference changes** (`useGitGraph.ts`, 108 LoC, hook). `HistoryTab.tsx:96` calls it without `useMemo` of inputs. Each `Load more` allocates a new `result` array and forces a full re-layout of every previously-rendered row. Combined with no list virtualization (50 → 100 → 150 commits, all DOM-mounted), large repos will visibly stutter.
- **P1 — `gitLog(repoPath, count)` is called with `maxCount = PAGE_SIZE * pages`, not paginated.** `HistoryTab.tsx:121-125`. "Load more" fetches the full window from scratch every time. By page 5 you're transferring 250 commits' worth of data on each click. Either use an offset/cursor or memoize what you already have.
- **P1 — `setError(String(err))` inside `handleSelectCommit` (line 134) clobbers the list error.** A failed diff fetch wipes the commit list's error banner; both are shared in one `error` state.
- **P2 — Commit message truncated at 72 chars (line 40) but already inside a `truncate` container.** Either trust CSS or drop the JS truncate — currently both run, and the JS one runs first regardless of column width.
- **P2 — `relativeTime` (`git.ts:139-155`) is recomputed on every render with no memoization.** Negligible per-row but multiplied across 250+ rows × `refreshSignal` cycles it's measurable.

### WorktreesTab

- **P0 — `grid sm:grid-cols-2 lg:grid-cols-3` (line 470)** breaks badly in the side panel. Tailwind's `sm:` is 640px, `lg:` is 1024px — the side panel never reaches either, so worktrees always render as a single column regardless of viewport. That's actually fine for ≤400px but at 600px (max panel width) you still get one column where two would fit. Move breakpoints to container queries (`@container`) or compute from `panel.width` via context.
- **P1 — `WorktreeCard` action row stacks three buttons + an icon button (line 104–164).** "Open in Terminal" + "Open as Workspace" labels alone need ~280px. Below that, text wraps awkwardly inside the buttons. Either icon-only at narrow widths or collapse into a `<DropdownMenu>` "Actions" trigger.
- **P1 — Confirm-to-remove uses a one-off `confirmRemove` boolean** (line 47). Reasonable, but it never resets on re-render of the parent list and doesn't trap focus on the confirm button. If the user removes another worktree first, the prior card may re-mount in confirm state due to `WorktreeInfo[]` ordering. Lift to a confirmed-id pattern at the parent.
- **P2 — `pathParts` derivation (line 44–46) handles trailing-slash and backslash but doesn't handle bare-name worktrees (e.g. `worktree`).** Edge case only.
- **P2 — `AddWorktreeDialog` (line 178–315) is a full modal inside a sidebar.** Fine, but `w-[min(420px,95vw)]` (line 223) ignores the actual editor area — at 1440px viewport it's centered over the whole window, which is correct, but make sure it's not getting cropped by parent `overflow-hidden` on the panel. (Suspense wrapper at `SidePanel.tsx:81` sets `overflow-y-auto`, fine; the parent `<aside>` is `flex shrink-0`, no overflow. OK.)
- **P2 — `AddWorktreeDialog` `useEffect` for branches has no cleanup** (line 187–191). If user opens/closes dialog rapidly between repos, a stale `gitListBranches` resolution can populate the now-closed dialog's state via React's auto-unmount-safe set, but a slow promise resolved after close is a benign no-op only because the component unmounted — verify in tests.
- **P2 — `is_dirty` clean/dirty pill (line 91–101)** uses `bg-yellow-400/15 text-yellow-500` for dirty. Contrast on dark mode is borderline (~3.5:1). Run through WCAG AA checker.

### Shared

- **P1 — `StatusGroup` collapsed state is local (line 60).** Collapsing "Untracked" and switching tabs / refreshing resets it. Persist per-group collapse state in localStorage keyed by repoPath.
- **P2 — `FileItem` puts the directory prefix and filename in one `<span>` with `truncate`** (line 41–45) — left-truncation of long paths would be more useful (filename should win when space is tight), but CSS doesn't natively support this without `direction: rtl` hacks.
- **P2 — `ResizeHandle` (line 8–14)** has no `aria-label`. `Separator` from `react-resizable-panels` should handle it, but add a hint.

## Cross-cutting findings

### Layout at narrow widths

| Width | Status |
|---|---|
| 180–240px | Unusable: 3 horizontal scrollers, split panes collapse to slivers, diff table clipped. |
| 240–400px | Cramped: file list and diff fight for space; commit graph + message overlap. |
| 400–600px | Workable for Worktrees (single column); ChangesTab/HistoryTab still feel tight. |
| 600px+ | Unreachable in the side panel (`MAX_WIDTH=600`, `SidePanel.tsx:34`). |

The side panel should probably either bump `MAX_WIDTH` for the git panel specifically, or — better — host a slim view here and put the full page elsewhere.

### Performance / re-renders

- **Scan + per-repo status on every workspace change, no cache** (P0, see Overall).
- **`gitDiffWorking` returns the whole repo's diff and is filtered client-side** (P1, ChangesTab).
- **`gitLog` re-fetches from offset 0 on every Load more** (P1, HistoryTab).
- **No virtualization** anywhere (commits, files, worktrees).
- **`window.focus` refresh is not panel-aware** (P1, GitPage).
- **`useGitGraph` recomputes graph on every commit-array identity change** (P0, HistoryTab).

### Stale references

None found. Grep for `tmux`, `App Store`, `multi-peer`, `peer sync` in `src/pages/git/` + `GitPage.tsx` returned no hits. The page is clean of pre-LiteDuck concepts.

### Orphaned `invoke()` calls

None. Every wrapper in `src/lib/git.ts` (`git_status`, `git_log`, `git_diff_working`, `git_diff_commit`, `git_current_branch`, `git_list_branches`, `git_worktree_list`, `git_worktree_add`, `git_worktree_remove`, `git_worktree_prune`, `git_init`, `git_scan_repos`) has a matching registration in `src-tauri/src/lib.rs:217-229`.

### A11y gaps

- No arrow-key navigation between tabs (both repo strip and view strip).
- No `role="tabpanel"` wrapper on the tab content area.
- File-list buttons and commit rows lack `aria-current="true"` when active (only `aria-selected` on tabs).
- `Add Worktree` dialog traps Escape correctly (line 215–217) but doesn't focus-trap inside the form — Tab can leak to background buttons.
- Dirty/clean pill contrast borderline at dark mode (see WorktreesTab P2).
- Commit graph `<svg>` has no `<title>` / `aria-label` — purely decorative is fine, but mark `aria-hidden="true"` to skip it cleanly.

## Recommended structural change

**Endorse the slim sidebar split, conditionally.** Keep a slim "Source Control" view in the side panel that mirrors VS Code: branch label, commit message input + Commit button, a single grouped change list with stage/unstage/discard inline. Promote the full GitPage to the editor area — when the rail's git icon is double-clicked (or via "Open Git in editor" command-palette entry), open a synthetic editor tab `git://current` that hosts the current 3-tab layout at full width with its split panes intact. The slim view becomes a subset of `ChangesTab` (drop the embedded diff pane; clicking a file opens the diff as an editor tab instead). History and Worktrees move out of the sidebar entirely — they don't fit and aren't day-to-day. Multi-repo selection stays in the slim view as a compact `<Select>` (not a tab strip).

```
┌────┬──────────────┬─────────────────────────┐
│ ▌▌ │ SOURCE CTRL  │  Editor: foo.ts         │
│ ▌▌ │ ───────────  │  Editor: git://current  │
│ G  │ repo: bwoc ▼ │  ┌─────────────────────┐│
│ F  │ ─── branch:  │  │ Changes  History    ││
│    │   main       │  │ ────────────────────││
│    │ [Commit msg] │  │  files │   diff     ││
│    │ [Commit btn] │  │        │            ││
│    │ ─── changes  │  └─────────────────────┘│
│    │ M src/a.ts ✓ │                         │
│    │ A src/b.ts ✓ │                         │
└────┴──────────────┴─────────────────────────┘
```

## Suggested follow-up actions

1. **Build the slim Source Control view** in `SidePanel.tsx`. Subset of ChangesTab: branch + commit message field + Commit button + grouped change list with stage/unstage/discard inline. New IPC commands: `git_add`, `git_reset`, `git_commit`, `git_discard_file`.
2. **Promote full GitPage to the editor area.** Open as a synthetic tab `git://<repo>` via the rail's double-click or a `git.openInEditor` command. Re-use the existing GitPage component verbatim at full width.
3. **Replace `gitDiffWorking` with per-file diff fetching.** Add `git_diff_working_file(repo, path)` Rust command; lazy-load on file selection. Cuts initial IPC payload from O(repo-changes) to O(1).
4. **Cache scan + dirty results per workspace.** Module-level Map keyed by `workspacePath`, invalidate on explicit Rescan or after N minutes. Drop the `window.focus` refresh entirely or scope it to the active panel.
5. **Paginate `gitLog` properly.** Cursor-based (`since_oid`) instead of `maxCount`. Wrap commit list in `@tanstack/react-virtual`. Memoize `useGitGraph` input.
6. **Container queries for WorktreesTab grid.** Replace `sm:grid-cols-2 lg:grid-cols-3` with `@container` queries so layout responds to the panel/tab width, not viewport.
7. **Add keyboard navigation to both tab strips.** Arrow keys cycle, Home/End jump, `aria-selected` updates `tabIndex` accordingly. Wrap tab content in `role="tabpanel"`.
8. **Reset per-tab state on `repoPath` change.** Either `key={repoPath}` on tab containers or explicit `useEffect` clears in ChangesTab/HistoryTab to avoid showing stale diffs during repo switch.
