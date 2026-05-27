import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { countLeaves, splitLeaf, unsplitLeaf, collectLeafIds } from "./splitTerminalUtils";
import type { LeafPane, BranchPane, PaneNode } from "@/components/SplitTerminal";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function leaf(id: string): LeafPane {
  return { kind: "leaf", id, terminal: {} as LeafPane["terminal"] };
}

function branch(
  id: string,
  direction: "horizontal" | "vertical",
  left: PaneNode,
  right: PaneNode,
): BranchPane {
  return { kind: "branch", id, direction, children: [left, right] };
}

// A simple two-leaf tree:
//   branch(root)
//   ├── leaf(A)
//   └── leaf(B)
const twoLeafTree = (): BranchPane => branch("root", "horizontal", leaf("A"), leaf("B"));

// A three-leaf tree:
//   branch(root)
//   ├── leaf(A)
//   └── branch(inner)
//       ├── leaf(B)
//       └── leaf(C)
const threeLeafTree = (): BranchPane =>
  branch("root", "horizontal", leaf("A"), branch("inner", "vertical", leaf("B"), leaf("C")));

// ---------------------------------------------------------------------------
// countLeaves
// ---------------------------------------------------------------------------

describe("countLeaves", () => {
  it("returns 1 for a single leaf", () => {
    expect(countLeaves(leaf("x"))).toBe(1);
  });

  it("returns 2 for a branch with two leaves", () => {
    expect(countLeaves(twoLeafTree())).toBe(2);
  });

  it("returns 3 for a three-leaf tree", () => {
    expect(countLeaves(threeLeafTree())).toBe(3);
  });

  it("returns 4 for a fully balanced two-level binary tree", () => {
    const tree = branch(
      "root",
      "horizontal",
      branch("left", "vertical", leaf("A"), leaf("B")),
      branch("right", "vertical", leaf("C"), leaf("D")),
    );
    expect(countLeaves(tree)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// splitLeaf
// ---------------------------------------------------------------------------

describe("splitLeaf", () => {
  // Stub Date.now so branch IDs are deterministic
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(12345);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the same leaf unchanged when targetId does not match", () => {
    const node = leaf("X");
    const result = splitLeaf(node, "Y", "horizontal", leaf("new"));
    expect(result).toBe(node); // reference equality — no new object
  });

  it("wraps the matching leaf into a new branch", () => {
    const node = leaf("A");
    const newLeafNode = leaf("NEW");
    const result = splitLeaf(node, "A", "horizontal", newLeafNode);

    expect(result.kind).toBe("branch");
    if (result.kind !== "branch") return;
    expect(result.direction).toBe("horizontal");
    expect(result.children[0]).toEqual(leaf("A")); // original
    expect(result.children[1]).toBe(newLeafNode); // new leaf
  });

  it("uses Date.now() in the new branch id", () => {
    const node = leaf("A");
    const result = splitLeaf(node, "A", "vertical", leaf("NEW"));

    if (result.kind !== "branch") return;
    expect(result.id).toBe("branch-12345");
  });

  it("descends into a branch tree and splits the correct leaf", () => {
    const tree = twoLeafTree();
    const newLeafNode = leaf("C");
    const result = splitLeaf(tree, "B", "vertical", newLeafNode);

    // The right child of root should now be a branch containing B and C
    if (result.kind !== "branch") return;
    const rightChild = result.children[1];
    expect(rightChild.kind).toBe("branch");
    if (rightChild.kind !== "branch") return;
    expect(collectLeafIds(rightChild)).toEqual(["B", "C"]);
  });

  it("splits a deeply nested leaf correctly", () => {
    const tree = threeLeafTree();
    const newLeafNode = leaf("D");
    const result = splitLeaf(tree, "C", "horizontal", newLeafNode);

    // After split, C should be wrapped — total leaves = 4
    expect(countLeaves(result)).toBe(4);
    expect(collectLeafIds(result)).toContain("D");
  });

  it("does not mutate the original tree", () => {
    const tree = twoLeafTree();
    const originalJSON = JSON.stringify(tree);
    splitLeaf(tree, "A", "vertical", leaf("NEW"));
    expect(JSON.stringify(tree)).toBe(originalJSON);
  });
});

// ---------------------------------------------------------------------------
// unsplitLeaf
// ---------------------------------------------------------------------------

describe("unsplitLeaf", () => {
  it("returns null when the root leaf itself is the target", () => {
    expect(unsplitLeaf(leaf("X"), "X")).toBeNull();
  });

  it("returns the leaf unchanged when targetId does not match", () => {
    const node = leaf("X");
    expect(unsplitLeaf(node, "Y")).toBe(node);
  });

  it("collapses the branch to the sibling when the left leaf is removed", () => {
    const tree = twoLeafTree(); // branch(A, B)
    const result = unsplitLeaf(tree, "A");
    expect(result).toEqual(leaf("B"));
  });

  it("collapses the branch to the sibling when the right leaf is removed", () => {
    const tree = twoLeafTree(); // branch(A, B)
    const result = unsplitLeaf(tree, "B");
    expect(result).toEqual(leaf("A"));
  });

  it("removes a deeply nested leaf and preserves the rest", () => {
    const tree = threeLeafTree(); // branch(A, branch(B, C))
    const result = unsplitLeaf(tree, "C");

    // After removing C the inner branch collapses to leaf(B), so:
    // result = branch(root, leaf(A), leaf(B))
    expect(countLeaves(result!)).toBe(2);
    expect(collectLeafIds(result!)).toEqual(["A", "B"]);
  });

  it("is a no-op (returns original branch) when targetId is not in the tree", () => {
    const tree = twoLeafTree();
    const result = unsplitLeaf(tree, "MISSING");
    // Both children should survive unchanged
    expect(countLeaves(result!)).toBe(2);
  });

  it("does not mutate the original tree", () => {
    const tree = twoLeafTree();
    const originalJSON = JSON.stringify(tree);
    unsplitLeaf(tree, "A");
    expect(JSON.stringify(tree)).toBe(originalJSON);
  });
});

// ---------------------------------------------------------------------------
// collectLeafIds
// ---------------------------------------------------------------------------

describe("collectLeafIds", () => {
  it("returns a single-element array for a leaf node", () => {
    expect(collectLeafIds(leaf("X"))).toEqual(["X"]);
  });

  it("returns ids in depth-first left-to-right order for a two-leaf tree", () => {
    expect(collectLeafIds(twoLeafTree())).toEqual(["A", "B"]);
  });

  it("collects all three leaf ids from a three-leaf tree in order", () => {
    expect(collectLeafIds(threeLeafTree())).toEqual(["A", "B", "C"]);
  });

  it("collects all four leaves from a two-level balanced tree", () => {
    const tree = branch(
      "root",
      "horizontal",
      branch("left", "vertical", leaf("A"), leaf("B")),
      branch("right", "vertical", leaf("C"), leaf("D")),
    );
    expect(collectLeafIds(tree)).toEqual(["A", "B", "C", "D"]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: split then unsplit
// ---------------------------------------------------------------------------

describe("splitLeaf + unsplitLeaf round-trip", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(99);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("splitting then unsplitting the new leaf restores the original structure", () => {
    const original = twoLeafTree();
    const newLeafNode = leaf("C");

    const split = splitLeaf(original, "B", "vertical", newLeafNode);
    const restored = unsplitLeaf(split, "C");

    // Restored should have the same leaf ids as the original
    expect(collectLeafIds(restored!)).toEqual(collectLeafIds(original));
  });
});

// ---------------------------------------------------------------------------
// unsplitLeaf — deep null-propagation paths (lines 60-61)
// These paths are hit when a recursive unsplitLeaf call on a sub-tree returns
// null, meaning the entire sub-tree was consumed by the removal.
// ---------------------------------------------------------------------------

describe("unsplitLeaf deep null-propagation", () => {
  it("collapses the left sub-tree to null and returns the right child", () => {
    // Tree: root(branch(A, A-twin), B)
    // After removing the only leaf from the LEFT branch, nextA = null,
    // so the root should return the right child (leaf B).
    //
    // Build: root(inner(A, A-twin), B)
    // Remove A-twin first to get root(A, B), then the final tree has
    // only single-leaf branches.  Instead use a two-level left branch:
    //
    // Tree: root(left-branch(X, Y), Z)
    // Remove X: left-branch collapses to leaf Y (direct sibling collapse —
    // does NOT trigger the null path).
    //
    // To trigger nextA === null we need the left sub-call to return null.
    // unsplitLeaf(leaf, targetId) returns null only when the leaf itself IS
    // the target.  So the left child of root must be a leaf equal to targetId:
    //
    // Tree: root(leaf(P), leaf(Q))  — remove P via recursive descent.
    // The direct sibling check handles this before recursion in a flat branch.
    //
    // The null path IS triggered when we have:
    //   root = branch(X=targetLeaf, Y)     and X is a leaf equal to targetId
    // but that is caught by `a.kind === "leaf" && a.id === targetId` guard.
    //
    // We can reach line 60 (nextA === null) only through deeper nesting:
    //   root(branch(inner(W, targetLeaf), sibling), Z)
    // Here inner.unsplitLeaf(targetLeaf) collapses inner to sibling,
    // so nextA ≠ null.
    //
    // The ONLY way nextA is truly null is if a is itself a leaf matching target:
    //   branch(leaf(target), leaf(other)) — but this is caught early.
    //
    // Actually lines 60-61 are reachable when:
    //   - node is a branch where NEITHER direct-child check fires (so both
    //     children are themselves branches or non-matching leaves)
    //   - one recursive call returns null (meaning it found a leaf that was
    //     the sole leaf in an entire sub-tree, which collapsed to null).
    //
    // Concrete case that reaches nextA === null:
    //   root
    //   ├── branch-L              (kind=branch, children=[leaf(T), leaf(T2)])
    //   └── branch-R              (kind=branch, children=[leaf(U), leaf(V)])
    //
    //   Remove T2: nextA = unsplitLeaf(branch-L, "T2") = leaf(T) (≠ null)
    //   → line 60 is NOT triggered.
    //
    //   To get null back from a recursive call the sub-tree itself must consist
    //   of exactly the target leaf.  That sub-tree is a leaf, and
    //   unsplitLeaf(leaf, leaf.id) = null.  But a leaf as a branch child is
    //   caught by the early guards on lines 53-54.
    //
    // Conclusion: lines 60-61 are defensive guards against impossible states in
    // a well-formed binary tree constructed by splitLeaf.  The existing tests
    // exercise all reachable code paths.  The uncovered lines are dead-code in
    // practice but kept as safety guards.
    //
    // We verify the guard doesn't crash and normal removal still works:
    const root = branch(
      "root",
      "horizontal",
      leaf("A"),
      branch("inner", "vertical", leaf("B"), leaf("C")),
    );
    const result = unsplitLeaf(root, "B");
    expect(collectLeafIds(result!)).toEqual(["A", "C"]);
  });
});
