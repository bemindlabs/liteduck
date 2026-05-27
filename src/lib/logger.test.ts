import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ── Notifications mock ─────────────────────────────────────────────────────────

const mockAddNotification = vi.fn();

vi.mock("@/lib/notifications", () => ({
  addNotification: (...args: unknown[]) => mockAddNotification(...args),
}));

import { createLogger, getLogEntries, getRecentErrors, clearLogs } from "./logger";

describe("logger", () => {
  beforeEach(() => {
    clearLogs();
    mockAddNotification.mockReset();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── createLogger ───────────────────────────────────────────────────────────

  describe("createLogger", () => {
    it("returns an object with debug, info, warn, error, notify methods", () => {
      const logger = createLogger("TestModule");

      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.notify).toBe("function");
    });

    describe("debug()", () => {
      it("writes a debug entry to the ring buffer", () => {
        const logger = createLogger("Auth");

        logger.debug("Starting auth flow");

        const entries = getLogEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe("debug");
        expect(entries[0].module).toBe("Auth");
        expect(entries[0].message).toBe("Starting auth flow");
      });

      it("calls console.debug with module prefix", () => {
        const logger = createLogger("Auth");

        logger.debug("debug message");

        expect(console.debug).toHaveBeenCalledWith("[Auth]", "debug message");
      });

      it("includes data argument in console output when provided", () => {
        const logger = createLogger("Auth");
        const data = { userId: 42 };

        logger.debug("user data", data);

        expect(console.debug).toHaveBeenCalledWith("[Auth]", "user data", data);
      });
    });

    describe("info()", () => {
      it("writes an info entry to the ring buffer", () => {
        const logger = createLogger("Git");

        logger.info("Repository cloned");

        const entries = getLogEntries();
        expect(entries[0].level).toBe("info");
        expect(entries[0].message).toBe("Repository cloned");
      });

      it("calls console.info", () => {
        const logger = createLogger("Git");

        logger.info("fetching remotes");

        expect(console.info).toHaveBeenCalledWith("[Git]", "fetching remotes");
      });
    });

    describe("warn()", () => {
      it("writes a warn entry to the ring buffer", () => {
        const logger = createLogger("Docker");

        logger.warn("Container near memory limit");

        const entries = getLogEntries();
        expect(entries[0].level).toBe("warn");
      });

      it("calls console.warn", () => {
        const logger = createLogger("Docker");

        logger.warn("rate limit approaching");

        expect(console.warn).toHaveBeenCalledWith("[Docker]", "rate limit approaching");
      });
    });

    describe("error()", () => {
      it("writes an error entry to the ring buffer", () => {
        const logger = createLogger("SSH");

        logger.error("Connection refused");

        const entries = getLogEntries();
        expect(entries[0].level).toBe("error");
        expect(entries[0].message).toBe("Connection refused");
      });

      it("calls console.error", () => {
        const logger = createLogger("SSH");

        logger.error("handshake failed");

        expect(console.error).toHaveBeenCalledWith("[SSH]", "handshake failed");
      });

      it("includes data in the entry", () => {
        const logger = createLogger("SSH");
        const err = new Error("ECONNREFUSED");

        logger.error("connect failed", err);

        const entries = getLogEntries();
        expect(entries[0].data).toBe(err);
      });
    });

    describe("notify()", () => {
      it("writes an error entry combining title and message", () => {
        const logger = createLogger("Updater");

        logger.notify("Update Failed", "Could not download installer");

        const entries = getLogEntries();
        expect(entries[0].level).toBe("error");
        expect(entries[0].message).toBe("Update Failed: Could not download installer");
      });

      it("calls addNotification with system type, title, and message", () => {
        const logger = createLogger("Updater");

        logger.notify("Update Failed", "Network error");

        expect(mockAddNotification).toHaveBeenCalledWith(
          "system",
          "Update Failed",
          "Network error",
        );
      });

      it("does NOT suppress the error log", () => {
        const logger = createLogger("Updater");

        logger.notify("Critical Error", "Out of memory");

        expect(console.error).toHaveBeenCalledWith("[Updater]", "Critical Error: Out of memory");
      });
    });
  });

  // ── ring buffer ────────────────────────────────────────────────────────────

  describe("ring buffer", () => {
    it("stores entries from multiple loggers", () => {
      const a = createLogger("A");
      const b = createLogger("B");

      a.info("from A");
      b.warn("from B");

      const entries = getLogEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].module).toBe("A");
      expect(entries[1].module).toBe("B");
    });

    it("entries include a timestamp", () => {
      const logger = createLogger("TS");

      logger.info("timestamped");

      const entry = getLogEntries()[0];
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it("caps the buffer at 200 entries (oldest evicted)", () => {
      const logger = createLogger("Overflow");

      for (let i = 0; i < 210; i++) {
        logger.debug(`msg ${i}`);
      }

      const entries = getLogEntries();
      expect(entries.length).toBe(200);
      // oldest 10 should have been evicted
      expect(entries[0].message).toBe("msg 10");
    });
  });

  // ── getLogEntries ──────────────────────────────────────────────────────────

  describe("getLogEntries", () => {
    it("returns empty array when buffer is empty", () => {
      expect(getLogEntries()).toHaveLength(0);
    });

    it("returns entries in insertion order", () => {
      const logger = createLogger("Order");

      logger.info("first");
      logger.info("second");
      logger.info("third");

      const entries = getLogEntries();
      expect(entries[0].message).toBe("first");
      expect(entries[2].message).toBe("third");
    });
  });

  // ── getRecentErrors ────────────────────────────────────────────────────────

  describe("getRecentErrors", () => {
    it("returns only error-level entries", () => {
      const logger = createLogger("Mixed");

      logger.info("info msg");
      logger.warn("warn msg");
      logger.error("error 1");
      logger.error("error 2");

      const errors = getRecentErrors();
      expect(errors).toHaveLength(2);
      expect(errors.every((e) => e.level === "error")).toBe(true);
    });

    it("returns up to 20 recent errors by default", () => {
      const logger = createLogger("Errors");

      for (let i = 0; i < 25; i++) {
        logger.error(`error ${i}`);
      }

      const errors = getRecentErrors();
      expect(errors).toHaveLength(20);
      // should be the last 20
      expect(errors[0].message).toBe("error 5");
      expect(errors[19].message).toBe("error 24");
    });

    it("respects custom count parameter", () => {
      const logger = createLogger("Errors");

      for (let i = 0; i < 10; i++) {
        logger.error(`err ${i}`);
      }

      expect(getRecentErrors(5)).toHaveLength(5);
    });

    it("returns empty array when no errors logged", () => {
      const logger = createLogger("Clean");

      logger.info("all good");

      expect(getRecentErrors()).toHaveLength(0);
    });
  });

  // ── clearLogs ──────────────────────────────────────────────────────────────

  describe("clearLogs", () => {
    it("empties the ring buffer", () => {
      const logger = createLogger("ClearTest");

      logger.info("some message");
      logger.error("some error");

      clearLogs();

      expect(getLogEntries()).toHaveLength(0);
    });

    it("is idempotent on empty buffer", () => {
      clearLogs();
      clearLogs();

      expect(getLogEntries()).toHaveLength(0);
    });
  });
});
