import { describe, it, expect } from "vitest";
import {
  normalizeView,
  parseKeyValue,
  parseList,
  parseTable,
} from "./parseOutput";

describe("normalizeView", () => {
  it("passes through known views", () => {
    for (const v of ["text", "table", "list", "keyvalue", "markdown"] as const) {
      expect(normalizeView(v)).toBe(v);
    }
  });

  it("maps unknown/absent to text", () => {
    expect(normalizeView(undefined)).toBe("text");
    expect(normalizeView("chart")).toBe("text");
    expect(normalizeView("")).toBe("text");
  });
});

describe("parseTable — canonical { columns, rows }", () => {
  it("parses the canonical contract", () => {
    const raw = JSON.stringify({
      columns: ["Agent", "Status"],
      rows: [
        ["agent-prime", "active"],
        ["agent-two", "idle"],
      ],
    });
    const res = parseTable(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.columns).toEqual(["Agent", "Status"]);
      expect(res.data.rows).toEqual([
        ["agent-prime", "active"],
        ["agent-two", "idle"],
      ]);
    }
  });
});

describe("parseTable — array-of-objects (BWOC {agents:[...]})", () => {
  it("derives columns from object keys and skips the debug `raw` key", () => {
    const raw = JSON.stringify({
      agents: [
        { name: "agent-prime", role: "active", raw: "● agent-prime active" },
        { name: "agent-two", role: "idle", raw: "○ agent-two idle" },
      ],
    });
    const res = parseTable(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.columns).toEqual(["name", "role"]); // `raw` skipped
      expect(res.data.rows).toEqual([
        ["agent-prime", "active"],
        ["agent-two", "idle"],
      ]);
    }
  });

  it("accepts a bare top-level array of objects", () => {
    const raw = JSON.stringify([{ key: "PROJ-1", status: "Open" }]);
    const res = parseTable(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.columns).toEqual(["key", "status"]);
      expect(res.data.rows).toEqual([["PROJ-1", "Open"]]);
    }
  });

  it("unions keys across heterogeneous rows", () => {
    const raw = JSON.stringify({
      issues: [{ key: "A-1", status: "Open" }, { key: "A-2", assignee: "duck" }],
    });
    const res = parseTable(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.columns).toEqual(["key", "status", "assignee"]);
      expect(res.data.rows).toEqual([
        ["A-1", "Open", ""],
        ["A-2", "", "duck"],
      ]);
    }
  });
});

describe("parseTable — malformed → not ok (caller falls back to text)", () => {
  it("rejects non-JSON output", () => {
    const res = parseTable("not json at all");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not valid JSON/);
  });

  it("rejects empty output", () => {
    expect(parseTable("   ").ok).toBe(false);
  });

  it("rejects a shape that is neither {columns,rows} nor an object array", () => {
    expect(parseTable(JSON.stringify({ foo: "bar" })).ok).toBe(false);
    expect(parseTable(JSON.stringify([1, 2, 3])).ok).toBe(false);
  });
});

describe("parseList", () => {
  it("parses { items: [{title, subtitle?, badge?}] }", () => {
    const raw = JSON.stringify({
      items: [{ title: "One", subtitle: "first", badge: "new" }, { title: "Two" }],
    });
    const res = parseList(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.items[0]).toEqual({ title: "One", subtitle: "first", badge: "new" });
      expect(res.data.items[1]).toEqual({ title: "Two" });
    }
  });

  it("accepts a bare string array", () => {
    const res = parseList(JSON.stringify(["a", "b"]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.items).toEqual([{ title: "a" }, { title: "b" }]);
  });

  it("rejects a non-list shape", () => {
    expect(parseList(JSON.stringify({ nope: true })).ok).toBe(false);
  });
});

describe("parseKeyValue", () => {
  it("parses { pairs: [[k,v]] }", () => {
    const res = parseKeyValue(JSON.stringify({ pairs: [["Version", "0.1.0"]] }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.pairs).toEqual([["Version", "0.1.0"]]);
  });

  it("accepts a flat object", () => {
    const res = parseKeyValue(JSON.stringify({ version: "0.1.0", network: false }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.pairs).toEqual([
        ["version", "0.1.0"],
        ["network", "false"],
      ]);
    }
  });

  it("rejects non-JSON", () => {
    expect(parseKeyValue("oops").ok).toBe(false);
  });
});
