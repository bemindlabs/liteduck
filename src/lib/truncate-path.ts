/** Last 1–2 path segments for display, e.g. `LiteDuck/src-tauri`. */
export function truncatePath(fullPath: string): string {
  const sep = fullPath.includes("/") ? "/" : "\\";
  const parts = fullPath.split(sep).filter(Boolean);
  return parts.slice(-2).join("/") || fullPath;
}
