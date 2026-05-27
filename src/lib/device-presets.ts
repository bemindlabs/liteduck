// ---------------------------------------------------------------------------
// Device viewport presets for the in-app browser
// ---------------------------------------------------------------------------

export type ViewportMode = "desktop" | "mobile" | "tablet";

export interface DevicePreset {
  id: string;
  label: string;
  mode: ViewportMode;
  /** CSS-pixel width (0 = fill container) */
  width: number;
  /** CSS-pixel height (0 = fill container) */
  height: number;
  icon: "Monitor" | "Smartphone" | "Tablet";
}

export const DEVICE_PRESETS: DevicePreset[] = [
  // Desktop — fills the container (sentinel: width/height = 0)
  { id: "desktop", label: "Desktop", mode: "desktop", width: 0, height: 0, icon: "Monitor" },

  // Mobile
  {
    id: "iphone-15",
    label: "iPhone 15",
    mode: "mobile",
    width: 393,
    height: 852,
    icon: "Smartphone",
  },
  {
    id: "iphone-15-pro-max",
    label: "iPhone 15 Pro Max",
    mode: "mobile",
    width: 430,
    height: 932,
    icon: "Smartphone",
  },
  { id: "pixel-8", label: "Pixel 8", mode: "mobile", width: 412, height: 924, icon: "Smartphone" },
  {
    id: "galaxy-s24",
    label: "Galaxy S24",
    mode: "mobile",
    width: 360,
    height: 780,
    icon: "Smartphone",
  },

  // Tablet
  {
    id: "ipad-10",
    label: "iPad (10th gen)",
    mode: "tablet",
    width: 820,
    height: 1180,
    icon: "Tablet",
  },
  {
    id: "ipad-pro-11",
    label: 'iPad Pro 11"',
    mode: "tablet",
    width: 834,
    height: 1194,
    icon: "Tablet",
  },
  {
    id: "ipad-pro-13",
    label: 'iPad Pro 13"',
    mode: "tablet",
    width: 1024,
    height: 1366,
    icon: "Tablet",
  },
  {
    id: "galaxy-tab-s9",
    label: "Galaxy Tab S9",
    mode: "tablet",
    width: 800,
    height: 1280,
    icon: "Tablet",
  },
];

export const DEFAULT_PRESET = DEVICE_PRESETS[0];

/** Get the first preset matching a given mode. */
export function defaultPresetForMode(mode: ViewportMode): DevicePreset {
  return DEVICE_PRESETS.find((p) => p.mode === mode) ?? DEFAULT_PRESET;
}

/** Get all presets for a given mode. */
export function presetsForMode(mode: ViewportMode): DevicePreset[] {
  return DEVICE_PRESETS.filter((p) => p.mode === mode);
}
