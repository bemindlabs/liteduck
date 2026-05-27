import {
  type SplitDirection,
  type PaneNode,
  type LeafPane,
  type BranchPane,
} from "@/components/SplitTerminal";

export function countLeaves(node: PaneNode): number {
  if (node.kind === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

/**
 * Replace the leaf with `targetId` with a new branch containing that leaf
 * and a fresh leaf supplied by the caller.
 */
export function splitLeaf(
  node: PaneNode,
  targetId: string,
  direction: SplitDirection,
  newLeaf: LeafPane,
): PaneNode {
  if (node.kind === "leaf") {
    if (node.id !== targetId) return node;
    const branch: BranchPane = {
      kind: "branch",
      id: `branch-${Date.now()}`,
      direction,
      children: [node, newLeaf],
    };
    return branch;
  }

  return {
    ...node,
    children: [
      splitLeaf(node.children[0], targetId, direction, newLeaf),
      splitLeaf(node.children[1], targetId, direction, newLeaf),
    ] as [PaneNode, PaneNode],
  };
}

/**
 * Remove the leaf with `targetId` from the tree. Its sibling collapses to
 * fill the branch slot. Returns null if the root itself is the target leaf.
 */
export function unsplitLeaf(node: PaneNode, targetId: string): PaneNode | null {
  if (node.kind === "leaf") {
    return node.id === targetId ? null : node;
  }

  const [a, b] = node.children;

  if (a.kind === "leaf" && a.id === targetId) return b;
  if (b.kind === "leaf" && b.id === targetId) return a;

  const nextA = unsplitLeaf(a, targetId);
  const nextB = unsplitLeaf(b, targetId);

  if (nextA === null) return nextB;
  if (nextB === null) return nextA;

  return {
    ...node,
    children: [nextA, nextB] as [PaneNode, PaneNode],
  };
}

/** Collect all leaf pane IDs (depth-first, left to right). */
export function collectLeafIds(node: PaneNode): string[] {
  if (node.kind === "leaf") return [node.id];
  return [...collectLeafIds(node.children[0]), ...collectLeafIds(node.children[1])];
}
