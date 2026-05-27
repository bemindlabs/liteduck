import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  COMMANDS,
  PAGE_ROUTES,
  commandMatchesQuery,
  filterCommands,
  fuzzyMatch,
  loadRecentIds,
  saveRecentId,
} from "./commands";
import { ROUTES } from "./routes";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  clear: vi.fn(() => {
    storage.clear();
  }),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

describe("command palette registry", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it("defines commands for pages and actions", () => {
    expect(COMMANDS.some((command) => command.category === "Pages")).toBe(true);
    expect(COMMANDS.some((command) => command.category === "Actions")).toBe(true);
  });

  it("maps page command ids to route constants", () => {
    expect(PAGE_ROUTES["page-terminal"]).toBe(ROUTES.TERMINAL);
    expect(PAGE_ROUTES["page-git"]).toBe(ROUTES.GIT);
    expect(PAGE_ROUTES["page-settings"]).toBe(ROUTES.SETTINGS);
  });

  it("loads an empty recent list by default", () => {
    expect(loadRecentIds()).toEqual([]);
  });

  it("returns an empty recent list when localStorage is invalid JSON", () => {
    localStorageMock.getItem.mockImplementationOnce(() => "not-json");

    expect(loadRecentIds()).toEqual([]);
  });

  it("saves recent ids with de-duplication and a max length of five", () => {
    ["a", "b", "c", "d", "e", "f"].forEach((id) => saveRecentId(id));
    saveRecentId("d");

    expect(loadRecentIds()).toEqual(["d", "f", "e", "c", "b"]);
  });

  it("matches fuzzy subsequences case-insensitively", () => {
    expect(fuzzyMatch("tm", "Terminal")).toBe(true);
    expect(fuzzyMatch("GH", "GitHub")).toBe(true);
    expect(fuzzyMatch("zz", "Terminal")).toBe(false);
    expect(fuzzyMatch("", "Terminal")).toBe(true);
  });

  it("matches commands by title or keyword", () => {
    const terminal = COMMANDS.find((command) => command.id === "page-terminal")!;
    const git = COMMANDS.find((command) => command.id === "page-git")!;

    expect(commandMatchesQuery(terminal, "term")).toBe(true);
    expect(commandMatchesQuery(git, "diff")).toBe(true);
    expect(commandMatchesQuery(git, "calendar")).toBe(false);
  });

  it("filters commands for a query without reordering unrelated matches", () => {
    const filtered = filterCommands(COMMANDS, "git", []);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((command) => commandMatchesQuery(command, "git"))).toBe(true);
  });

  it("floats recent commands to the top when query is empty", () => {
    const terminal = COMMANDS.find((command) => command.id === "page-terminal")!;
    const settings = COMMANDS.find((command) => command.id === "page-settings")!;

    const ordered = filterCommands([settings, terminal], "", [terminal.id, settings.id]);

    expect(ordered.map((command) => command.id)).toEqual([terminal.id, settings.id]);
  });
});
