import { type GraphRow } from "@/hooks/useGitGraph";

export function GraphCell({ row }: { row: GraphRow }) {
  const LANE_WIDTH = 14;
  const HALF_LANE = 7;
  const RADIUS = 4;

  const widthStr = (row.maxLane + 1) * LANE_WIDTH + 8;

  return (
    <div className="relative h-full shrink-0" style={{ width: widthStr, minHeight: 48 }}>
      <svg className="absolute inset-0 h-full w-full">
        {/* upLines */}
        {row.upLines.map((line, i) => (
          <line
            key={`u-${i}`}
            x1={line.lane * LANE_WIDTH + HALF_LANE}
            y1="0"
            x2={line.lane * LANE_WIDTH + HALF_LANE}
            y2="50%"
            stroke={line.color}
            strokeWidth={2}
          />
        ))}

        {/* downLines */}
        {row.downLines.map((line, i) => {
          const x1 = line.from * LANE_WIDTH + HALF_LANE;
          const x2 = line.to * LANE_WIDTH + HALF_LANE;

          return (
            <line
              key={`d-${i}`}
              x1={x1}
              y1="50%"
              x2={x2}
              y2="100%"
              stroke={line.color}
              strokeWidth={2}
            />
          );
        })}

        {/* dot */}
        <circle
          cx={row.dot.lane * LANE_WIDTH + HALF_LANE}
          cy="50%"
          r={RADIUS}
          fill={row.dot.color}
          stroke="var(--color-card)"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}
