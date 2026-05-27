import { useMemo } from "react";
import { type GitCommit } from "@/lib/git";

export const GRAPH_COLORS = [
  "#3b82f6", // blue-500
  "#ef4444", // red-500
  "#22c55e", // green-500
  "#eab308", // yellow-500
  "#a855f7", // purple-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
];

export interface GraphUpLine {
  lane: number;
  color: string;
}

export interface GraphDownLine {
  from: number;
  to: number;
  color: string;
}

export interface GraphRow {
  dot: { lane: number; color: string };
  upLines: GraphUpLine[];
  downLines: GraphDownLine[];
  maxLane: number;
}

export function useGitGraph(commits: GitCommit[]) {
  return useMemo(() => {
    const rows: GraphRow[] = [];
    const activeBranches = new Map<string, { lane: number; color: string }>();
    let nextColorIdx = 0;

    const findFreeLane = () => {
      const usedLanes = new Set(Array.from(activeBranches.values()).map((b) => b.lane));
      let l = 0;
      while (usedLanes.has(l)) l++;
      return l;
    };

    const getNextColor = () => {
      return GRAPH_COLORS[nextColorIdx++ % GRAPH_COLORS.length];
    };

    for (const commit of commits) {
      const upLines: GraphUpLine[] = [];
      const alreadyActive = new Set(activeBranches.keys());

      for (const [, v] of activeBranches.entries()) {
        upLines.push({ lane: v.lane, color: v.color });
      }

      let dotLane: number;
      let dotColor: string;

      const atOid = activeBranches.get(commit.oid);
      if (atOid !== undefined) {
        dotLane = atOid.lane;
        dotColor = atOid.color;
        activeBranches.delete(commit.oid);
      } else {
        dotLane = findFreeLane();
        dotColor = getNextColor();
      }

      const downLines: GraphDownLine[] = [];

      commit.parents.forEach((p, idx) => {
        const parentL = activeBranches.get(p);
        if (parentL !== undefined) {
          downLines.push({ from: dotLane, to: parentL.lane, color: parentL.color });
        } else {
          const pLane = idx === 0 ? dotLane : findFreeLane();
          const pColor = idx === 0 ? dotColor : getNextColor();
          activeBranches.set(p, { lane: pLane, color: pColor });
          downLines.push({ from: dotLane, to: pLane, color: pColor });
        }
      });

      for (const [k, v] of activeBranches.entries()) {
        if (alreadyActive.has(k)) {
          downLines.push({ from: v.lane, to: v.lane, color: v.color });
        }
      }

      const allLanes = [
        dotLane,
        ...upLines.map((u) => u.lane),
        ...downLines.map((d) => d.from),
        ...downLines.map((d) => d.to),
      ];
      const maxLane = Math.max(0, ...allLanes);

      rows.push({
        dot: { lane: dotLane, color: dotColor },
        upLines,
        downLines,
        maxLane,
      });
    }

    return rows;
  }, [commits]);
}
