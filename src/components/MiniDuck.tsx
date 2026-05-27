// ── Shared MiniDuck SVG Character ───────────────────────────────────────────
// Used by AgentsWorkingView (full-size) and AgentCard (thumbnail).

import { darken, lighten } from "@/lib/mini-duck-colors";

export interface MiniDuckProps {
  color: string;
  icon: string;
  size?: number;
  className?: string;
  /** When true, wing-wave and eye-glow animations are active (always-on mode for WorkingView) */
  animated?: boolean;
  /**
   * When true, replaces Tailwind animate-* classes with plain CSS class names
   * (duck-wing-left / duck-wing-right / duck-eye) so the parent .agent-card
   * hover selectors in index.css can control the animations.
   */
  cardMode?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MiniDuck({
  color,
  icon,
  size = 80,
  className,
  animated = true,
  cardMode = false,
}: MiniDuckProps) {
  const bodyColor = color || "#F8C543";
  const darkColor = darken(bodyColor, 30);
  const lightColor = lighten(bodyColor, 40);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 140"
      width={size}
      height={size * 1.17}
      className={className}
      role="img"
      aria-label="Agent duck character"
    >
      {/* Body */}
      <ellipse
        cx="60"
        cy="88"
        rx="38"
        ry="30"
        fill={bodyColor}
        stroke={darkColor}
        strokeWidth="2"
      />
      {/* Left wing */}
      <ellipse
        cx="28"
        cy="85"
        rx="12"
        ry="18"
        fill={darkColor}
        opacity="0.7"
        className={cardMode ? "duck-wing-left" : animated ? "animate-wing-left" : undefined}
      />
      {/* Right wing */}
      <ellipse
        cx="92"
        cy="85"
        rx="12"
        ry="18"
        fill={darkColor}
        opacity="0.7"
        className={cardMode ? "duck-wing-right" : animated ? "animate-wing-right" : undefined}
      />
      {/* Head */}
      <ellipse
        cx="60"
        cy="50"
        rx="30"
        ry="28"
        fill={lightColor}
        stroke={darkColor}
        strokeWidth="2"
      />
      {/* Helmet / visor */}
      <path
        d="M34 40C42 32 52 28 60 28C68 28 78 32 86 40V50C78 58 68 62 60 62C52 62 42 58 34 50V40Z"
        fill="#1D2942"
        stroke={darkColor}
        strokeWidth="2"
      />
      {/* Eyes */}
      <ellipse
        cx="48"
        cy="45"
        rx="7"
        ry="5"
        fill="#52E7FF"
        className={cardMode ? "duck-eye" : animated ? "animate-eye-glow" : undefined}
      />
      <ellipse
        cx="72"
        cy="45"
        rx="7"
        ry="5"
        fill="#52E7FF"
        className={cardMode ? "duck-eye" : animated ? "animate-eye-glow" : undefined}
      />
      {/* Eye highlights */}
      <circle cx="50" cy="43" r="2" fill="#F8FAFC" />
      <circle cx="74" cy="43" r="2" fill="#F8FAFC" />
      {/* Beak */}
      <path
        d="M44 55C50 52 56 50 60 50C64 50 70 52 76 55C72 60 66 63 60 63C54 63 48 60 44 55Z"
        fill="#FF9233"
        stroke={darkColor}
        strokeWidth="1.5"
      />
      {/* Chest screen */}
      <rect
        x="42"
        y="76"
        rx="8"
        width="36"
        height="24"
        fill="#0F172A"
        stroke="#38BDF8"
        strokeWidth="1"
        opacity="0.8"
      />
      {/* Icon on screen */}
      <text x="60" y="93" textAnchor="middle" fontSize="14" className="select-none">
        {icon}
      </text>
      {/* Feet */}
      <ellipse
        cx="48"
        cy="116"
        rx="10"
        ry="5"
        fill="#FF9233"
        stroke={darkColor}
        strokeWidth="1.5"
      />
      <ellipse
        cx="72"
        cy="116"
        rx="10"
        ry="5"
        fill="#FF9233"
        stroke={darkColor}
        strokeWidth="1.5"
      />
      {/* Loop orbit ring */}
      <ellipse
        cx="60"
        cy="75"
        rx="50"
        ry="48"
        fill="none"
        stroke="url(#loop-grad)"
        strokeWidth="3"
        strokeDasharray="6 4"
        opacity={cardMode ? "0.15" : "0.3"}
        className={cardMode ? undefined : animated ? "animate-loop-spin" : undefined}
      />
      <defs>
        <linearGradient id="loop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#52E7FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}
