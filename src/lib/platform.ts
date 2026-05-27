/**
 * Platform detection utilities.
 *
 * Uses navigator heuristics since @tauri-apps/plugin-os is not a dependency.
 * Safe to call synchronously at any point — no async setup required.
 */

export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPad on iOS 13+ reports itself as MacIntel but has touch points
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1)
  );
}

export function isIPad(): boolean {
  return (
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1) ||
    navigator.userAgent.includes("iPad")
  );
}

export function isMobile(): boolean {
  // iPad is treated as desktop-class — only phones are "mobile"
  if (isIPad()) return false;
  return isIOS() || navigator.userAgent.includes("Android");
}

export function isDesktop(): boolean {
  return !isMobile();
}

/**
 * True when the app runs on a platform with full native OS access (PTY, Docker, git, SSH).
 * iPad is iOS under the hood — it has a desktop-class layout but an iOS sandbox,
 * so it returns false here even though `isMobile()` also returns false for iPad.
 */
export function hasNativeCapabilities(): boolean {
  return !isIOS() && !navigator.userAgent.includes("Android");
}
