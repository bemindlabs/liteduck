import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useGitGraph, GRAPH_COLORS, type GraphRow } from "./useGitGraph";
import type { GitCommit } from "@/lib/git";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCommit(oid: string, parents: string[], overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    oid,
    parents,
    message: `commit ${oid}`,
    author: "Test User",
    author_email: "test@example.com",
    time: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: empty / trivial input
// ---------------------------------------------------------------------------

describe("useGitGraph — empty input", () => {
  it("returns an empty array for an empty commit list", () => {
    const { result } = renderHook(() => useGitGraph([]));
    expect(result.current).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: linear history (single-parent chain)
// ---------------------------------------------------------------------------

describe("useGitGraph — linear history", () => {
  const commits: GitCommit[] = [
    makeCommit("c3", ["c2"]),
    makeCommit("c2", ["c1"]),
    makeCommit("c1", []),
  ];

  it("returns one row per commit", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    expect(result.current).toHaveLength(3);
  });

  it("all dots are on lane 0 for a linear chain", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    result.current.forEach((row) => {
      expect(row.dot.lane).toBe(0);
    });
  });

  it("dot color for the first commit is the first GRAPH_COLORS entry", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    expect(result.current[0].dot.color).toBe(GRAPH_COLORS[0]);
  });

  it("maxLane is 0 for every row in a linear history", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    result.current.forEach((row) => {
      expect(row.maxLane).toBe(0);
    });
  });

  it("the root commit (no parents) has no downLines", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    const rootRow = result.current[result.current.length - 1];
    expect(rootRow.downLines).toHaveLength(0);
  });

  it("intermediate commits carry exactly one downLine continuing the lane", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    // c2 row (index 1) has one parent (c1) on lane 0
    const c2Row = result.current[1];
    expect(c2Row.downLines).toHaveLength(1);
    expect(c2Row.downLines[0].from).toBe(0);
    expect(c2Row.downLines[0].to).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: branch & merge (two-parent commit)
// ---------------------------------------------------------------------------

describe("useGitGraph — branch and merge", () => {
  // Graph shape:
  //   merge (oid: "m", parents: ["a", "b"])
  //   a                b
  //   root
  //
  // Commits passed in topological (newest first) order.
  const commits: GitCommit[] = [
    makeCommit("m", ["a", "b"]),
    makeCommit("a", ["root"]),
    makeCommit("b", ["root"]),
    makeCommit("root", []),
  ];

  it("returns one row per commit", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    expect(result.current).toHaveLength(4);
  });

  it("merge commit has two downLines (one per parent)", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    const mergeRow = result.current[0];
    expect(mergeRow.downLines).toHaveLength(2);
  });

  it("the second parent of the merge commit occupies a different lane than the first", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    const mergeRow = result.current[0];
    const lanes = mergeRow.downLines.map((dl) => dl.to);
    expect(lanes[0]).not.toBe(lanes[1]);
  });

  it("maxLane is at least 1 after a branch occurs", () => {
    const { result } = renderHook(() => useGitGraph(commits));
    // After the merge row introduces a second lane, at least one row should
    // have maxLane >= 1.
    const hasMultiLane = result.current.some((row: GraphRow) => row.maxLane >= 1);
    expect(hasMultiLane).toBe(true);
  });

  it("colors wrap around after exhausting GRAPH_COLORS", () => {
    // Build a very wide parallel history to force color cycling.
    const manyParents = Array.from({ length: GRAPH_COLORS.length + 1 }, (_, i) => `p${i}`);
    const merge = makeCommit("merge", manyParents);
    const roots = manyParents.map((p) => makeCommit(p, []));
    const { result } = renderHook(() => useGitGraph([merge, ...roots]));

    // Collect all dot colors
    const colors = result.current.map((r) => r.dot.color);
    // The last color should wrap back to GRAPH_COLORS[0]
    expect(GRAPH_COLORS).toContain(colors[colors.length - 1]);
  });
});

// ---------------------------------------------------------------------------
// Tests: single root commit (no parents)
// ---------------------------------------------------------------------------

describe("useGitGraph — single orphan commit", () => {
  it("produces one row with no upLines and no downLines", () => {
    const commits = [makeCommit("init", [])];
    const { result } = renderHook(() => useGitGraph(commits));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].upLines).toHaveLength(0);
    expect(result.current[0].downLines).toHaveLength(0);
  });

  it("maxLane is 0 for a single commit", () => {
    const commits = [makeCommit("init", [])];
    const { result } = renderHook(() => useGitGraph(commits));
    expect(result.current[0].maxLane).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: memoization
// ---------------------------------------------------------------------------

describe("useGitGraph — memoization", () => {
  it("returns the same array reference when commits reference is unchanged", () => {
    const commits = [makeCommit("c1", [])];
    const { result, rerender } = renderHook(() => useGitGraph(commits));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("recomputes when the commits array reference changes", () => {
    const { result, rerender } = renderHook(
      ({ commits }: { commits: GitCommit[] }) => useGitGraph(commits),
      { initialProps: { commits: [makeCommit("c1", [])] } },
    );
    const first = result.current;
    rerender({ commits: [makeCommit("c2", [])] });
    expect(result.current).not.toBe(first);
  });
});
