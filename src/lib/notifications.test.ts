import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  notificationStore,
  addNotification,
  markRead,
  markAllRead,
  clearAll,
  getUnreadCount,
  type NotificationType,
} from "./notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the singleton to a clean state before each test. */
function resetStore() {
  // Use the public clearAll then patch nextId via the module-level binding so
  // ids are predictable. The store resets on clearAll — ids still increment
  // from whatever nextId is at, but that is fine for these tests.
  notificationStore.clearAll();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("NotificationStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -- addNotification --------------------------------------------------------

  describe("addNotification", () => {
    it("adds a notification and returns it with the correct fields", () => {
      const n = addNotification("github", "PR merged", "body text");
      expect(n.type).toBe("github");
      expect(n.title).toBe("PR merged");
      expect(n.message).toBe("body text");
      expect(n.read).toBe(false);
      expect(typeof n.id).toBe("string");
      expect(n.timestamp).toBeInstanceOf(Date);
    });

    it("prepends notifications so the newest is first in the snapshot", () => {
      addNotification("system", "first", "");
      addNotification("system", "second", "");
      const snapshot = notificationStore.getSnapshot();
      expect(snapshot[0].title).toBe("second");
    });

    it("increments the id with each addition", () => {
      const a = addNotification("github", "a", "");
      const b = addNotification("github", "b", "");
      expect(Number(b.id)).toBeGreaterThan(Number(a.id));
    });

    it("stores the optional icon when provided", () => {
      const n = addNotification("system", "Build", "msg", "cpu");
      expect(n.icon).toBe("cpu");
    });

    it("leaves icon undefined when not provided", () => {
      const n = addNotification("system", "no icon", "");
      expect(n.icon).toBeUndefined();
    });

    it("sets timestamp to a Date near the current time", () => {
      const before = Date.now();
      const n = addNotification("system", "ts test", "");
      const after = Date.now();
      expect(n.timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(n.timestamp.getTime()).toBeLessThanOrEqual(after);
    });

    it("notifies subscribers when a notification is added", () => {
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      addNotification("github", "x", "");
      unsub();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("snapshot length grows with each addition", () => {
      addNotification("github", "a", "");
      addNotification("github", "b", "");
      expect(notificationStore.getSnapshot()).toHaveLength(2);
    });
  });

  // -- markRead ---------------------------------------------------------------

  describe("markRead", () => {
    it("marks a specific notification as read", () => {
      const n = addNotification("github", "PR", "body");
      markRead(n.id);
      const found = notificationStore.getSnapshot().find((x) => x.id === n.id);
      expect(found?.read).toBe(true);
    });

    it("does not affect other notifications", () => {
      const a = addNotification("github", "A", "");
      const b = addNotification("github", "B", "");
      markRead(a.id);
      const bInStore = notificationStore.getSnapshot().find((x) => x.id === b.id);
      expect(bInStore?.read).toBe(false);
    });

    it("does not notify listeners when notification is already read", () => {
      const n = addNotification("github", "PR", "body");
      markRead(n.id); // first mark — makes it read
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      markRead(n.id); // already read — should be a no-op
      unsub();
      expect(listener).not.toHaveBeenCalled();
    });

    it("does not throw when id does not exist", () => {
      expect(() => markRead("non-existent-id")).not.toThrow();
    });

    it("notifies listeners when an unread notification is marked read", () => {
      const n = addNotification("system", "t", "");
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      markRead(n.id);
      unsub();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // -- markAllRead ------------------------------------------------------------

  describe("markAllRead", () => {
    it("marks every notification as read", () => {
      addNotification("github", "a", "");
      addNotification("github", "b", "");
      markAllRead();
      const unread = notificationStore.getSnapshot().filter((n) => !n.read);
      expect(unread).toHaveLength(0);
    });

    it("is a no-op when all notifications are already read", () => {
      const n = addNotification("system", "x", "");
      markRead(n.id);
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      markAllRead();
      unsub();
      expect(listener).not.toHaveBeenCalled();
    });

    it("notifies listeners when there are unread notifications", () => {
      addNotification("system", "x", "");
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      markAllRead();
      unsub();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("is a no-op on an empty store", () => {
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      markAllRead();
      unsub();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // -- clearAll ---------------------------------------------------------------

  describe("clearAll", () => {
    it("removes all notifications from the store", () => {
      addNotification("github", "a", "");
      addNotification("github", "b", "");
      clearAll();
      expect(notificationStore.getSnapshot()).toHaveLength(0);
    });

    it("is a no-op when the store is already empty", () => {
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      clearAll(); // empty — should be a no-op
      unsub();
      expect(listener).not.toHaveBeenCalled();
    });

    it("notifies listeners when there are notifications to clear", () => {
      addNotification("system", "z", "");
      const listener = vi.fn();
      const unsub = notificationStore.subscribe(listener);
      clearAll();
      unsub();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // -- getUnreadCount ---------------------------------------------------------

  describe("getUnreadCount", () => {
    it("returns 0 for an empty store", () => {
      expect(getUnreadCount()).toBe(0);
    });

    it("returns the total count when none are read", () => {
      addNotification("github", "a", "");
      addNotification("github", "b", "");
      expect(getUnreadCount()).toBe(2);
    });

    it("counts only unread notifications", () => {
      const a = addNotification("github", "a", "");
      addNotification("github", "b", "");
      markRead(a.id);
      expect(getUnreadCount()).toBe(1);
    });

    it("returns 0 after markAllRead", () => {
      addNotification("system", "x", "");
      addNotification("system", "y", "");
      markAllRead();
      expect(getUnreadCount()).toBe(0);
    });

    it("returns 0 after clearAll", () => {
      addNotification("system", "x", "");
      clearAll();
      expect(getUnreadCount()).toBe(0);
    });
  });

  // -- subscribe / unsubscribe ------------------------------------------------

  describe("subscribe", () => {
    it("returns an unsubscribe function that stops future listener calls", () => {
      const listener = vi.fn();
      const unsubscribe = notificationStore.subscribe(listener);
      unsubscribe();
      addNotification("system", "after unsub", "");
      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple independent listeners", () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      const u1 = notificationStore.subscribe(l1);
      const u2 = notificationStore.subscribe(l2);
      addNotification("github", "a", "");
      u1();
      u2();
      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });
  });

  // -- getSnapshot ------------------------------------------------------------

  describe("getSnapshot", () => {
    it("returns a new array reference after each mutation", () => {
      const snap1 = notificationStore.getSnapshot();
      addNotification("system", "x", "");
      const snap2 = notificationStore.getSnapshot();
      expect(snap1).not.toBe(snap2);
    });

    it("returns all notifications in order (newest first)", () => {
      addNotification("github", "first", "");
      addNotification("github", "second", "");
      const [head, tail] = notificationStore.getSnapshot();
      expect(head.title).toBe("second");
      expect(tail.title).toBe("first");
    });
  });

  // -- NotificationType coverage ----------------------------------------------

  describe("NotificationType", () => {
    const types: NotificationType[] = ["github", "system"];

    it.each(types)("stores type '%s' correctly", (type) => {
      const n = addNotification(type, "title", "msg");
      expect(n.type).toBe(type);
    });
  });
});
