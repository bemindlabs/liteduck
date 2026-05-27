import { addNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 200;
const entries: LogEntry[] = [];

function push(entry: LogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

function createLogger(module: string) {
  function log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = { level, module, message, data, timestamp: new Date() };
    push(entry);

    const prefix = `[${module}]`;
    switch (level) {
      case "debug":
        console.debug(prefix, message, ...(data !== undefined ? [data] : []));
        break;
      case "info":
        console.info(prefix, message, ...(data !== undefined ? [data] : []));
        break;
      case "warn":
        console.warn(prefix, message, ...(data !== undefined ? [data] : []));
        break;
      case "error":
        console.error(prefix, message, ...(data !== undefined ? [data] : []));
        break;
    }
  }

  return {
    debug: (message: string, data?: unknown) => log("debug", message, data),
    info: (message: string, data?: unknown) => log("info", message, data),
    warn: (message: string, data?: unknown) => log("warn", message, data),
    error: (message: string, data?: unknown) => log("error", message, data),
    /** Log an error AND surface a notification to the user. */
    notify: (title: string, message: string, data?: unknown) => {
      log("error", `${title}: ${message}`, data);
      addNotification("system", title, message);
    },
  };
}

// ---------------------------------------------------------------------------
// Buffer accessors
// ---------------------------------------------------------------------------

/** All stored log entries, oldest first. */
function getLogEntries(): readonly LogEntry[] {
  return entries;
}

/** The most recent error entries (default: last 20). */
function getRecentErrors(count = 20): LogEntry[] {
  return entries.filter((e) => e.level === "error").slice(-count);
}

/** Flush the in-memory log buffer. */
function clearLogs(): void {
  entries.length = 0;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { createLogger, getLogEntries, getRecentErrors, clearLogs };
export type { LogEntry, LogLevel };
