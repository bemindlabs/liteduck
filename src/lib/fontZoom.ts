/**
 * fontZoom — app-wide zoom (overall UI/text size), like a browser's Cmd +/− / 0.
 *
 * Applied via the CSS `zoom` property on the document root, which both Chromium and
 * WebKit (the macOS Tauri webview) support and which scales everything uniformly —
 * including the many px-based type sizes in the UI. The level is persisted to
 * localStorage and restored on startup.
 */

const STORAGE_KEY = "liteduck_zoom";
const MIN = 0.7;
const MAX = 2.0;
const STEP = 0.1;
const DEFAULT = 1.0;

function clamp(scale: number): number {
  // Round to one decimal to avoid floating-point drift across many steps.
  const rounded = Math.round(scale * 10) / 10;
  return Math.min(MAX, Math.max(MIN, rounded));
}

let current = DEFAULT;

function persist(scale: number): void {
  try {
    if (scale === DEFAULT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    // localStorage unavailable — zoom still applies for this session.
  }
}

/** Apply the current scale to the document root. */
function apply(scale: number): void {
  if (typeof document === "undefined") return;
  // `zoom: 1` (or "") is the natural size; setting "" keeps the DOM clean.
  (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom =
    scale === DEFAULT ? "" : String(scale);
}

export function getZoom(): number {
  return current;
}

export function setZoom(scale: number): number {
  current = clamp(scale);
  apply(current);
  persist(current);
  return current;
}

export function zoomIn(): number {
  return setZoom(current + STEP);
}

export function zoomOut(): number {
  return setZoom(current - STEP);
}

export function resetZoom(): number {
  return setZoom(DEFAULT);
}

/** Load the persisted zoom and apply it. Call once on app startup. */
export function initZoom(): void {
  let saved = DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) saved = parsed;
    }
  } catch {
    // ignore — fall back to default
  }
  current = clamp(saved);
  apply(current);
}
