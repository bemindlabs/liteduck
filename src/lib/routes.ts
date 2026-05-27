/**
 * Centralized route path constants for the LiteDuck application.
 * Use these constants instead of hardcoded strings in navigate(), to=, and path= props.
 */
export const ROUTES = {
  HOME: "/",
  // Full-screen (no sidebar/header)
  WIZARD: "/wizard",
  LANDING: "/landing",
  // Development
  FILES: "/files",
  TERMINAL: "/terminal",
  // Source Control
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
