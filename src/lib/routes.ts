/**
 * Centralized route path constants for the LiteDuck application.
 * Use these constants instead of hardcoded strings in navigate(), to=, and path= props.
 *
 * The desktop app uses a VS Code-style workspace shell rendered at every native
 * route (HOME / TERMINAL / FILES / GIT / NOTIFICATIONS). The `panel` on the side
 * is derived from the active path so deep-links like `/files` still highlight
 * the Files tree, while the editor + terminal dock remain visible.
 */
export const ROUTES = {
  HOME: "/",
  // Full-screen (no sidebar/header)
  WIZARD: "/wizard",
  LANDING: "/landing",
  // Workspace panels (each one selects the matching side panel in the shell)
  FILES: "/files",
  TERMINAL: "/terminal",
  GIT: "/git",
  // Utility
  NOTIFICATIONS: "/notifications",
  SETTINGS: "/settings",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * Routes that require full native OS capabilities (PTY, git2).
 * These are hidden on iOS/Android (including iPad) where the Rust backend
 * does not expose those commands.
 */
export const NATIVE_ONLY_ROUTES = new Set<string>([ROUTES.TERMINAL, ROUTES.FILES, ROUTES.GIT]);

/**
 * Workspace side-panel identifiers. The activity rail toggles between these,
 * and each is also reachable via its route (which scrolls the panel into view
 * inside the shell). `null` means the side panel is collapsed.
 */
export type WorkspacePanel = "files" | "git" | "settings" | "notifications";

/** Map a router path to the corresponding side-panel identifier (if any). */
export function panelFromPath(pathname: string): WorkspacePanel | null {
  if (pathname === ROUTES.FILES) return "files";
  if (pathname === ROUTES.GIT) return "git";
  if (pathname === ROUTES.SETTINGS) return "settings";
  if (pathname === ROUTES.NOTIFICATIONS) return "notifications";
  return null;
}
