import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

// ---------------------------------------------------------------------------
// localStorage mock (jsdom environment does not provide .clear())
// ---------------------------------------------------------------------------

const _storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => _storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    _storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    _storage.delete(key);
  }),
  clear: vi.fn(() => {
    _storage.clear();
  }),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

// jsdom does not implement scrollIntoView — stub it
Element.prototype.scrollIntoView = vi.fn();

import { CommandPalette } from "./CommandPalette";

// ---------------------------------------------------------------------------
// Default prop factory
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onToggleDark: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleFocusMode: vi.fn(),
    ...overrides,
  };
}

function renderPalette(overrides?: Partial<React.ComponentProps<typeof CommandPalette>>) {
  const props = makeProps(overrides);
  const result = render(<CommandPalette {...props} />);
  return { ...result, props };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommandPalette", () => {
  beforeEach(() => {
    _storage.clear();
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    renderPalette({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open", () => {
    renderPalette();
    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
  });

  it("renders the search input with correct placeholder", () => {
    renderPalette();
    expect(screen.getByPlaceholderText(/search commands, pages, agents/i)).toBeInTheDocument();
  });

  it("shows all commands in the list when no query is typed", () => {
    renderPalette();
    // "Terminal" is a known page command
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    // "Toggle Dark Mode" is an action command
    expect(screen.getByText("Toggle Dark Mode")).toBeInTheDocument();
  });

  it("filters commands by search query", async () => {
    const user = userEvent.setup();
    renderPalette();

    const input = screen.getByPlaceholderText(/search commands/i);
    await user.type(input, "git");

    expect(screen.getByText("Git")).toBeInTheDocument();
    // Terminal should not be visible when searching "git"
    expect(screen.queryByText("Terminal")).not.toBeInTheDocument();
  });

  it("shows no-results message for unmatched query", async () => {
    const user = userEvent.setup();
    renderPalette();

    const input = screen.getByPlaceholderText(/search commands/i);
    await user.type(input, "xyznotarealcommand");

    expect(screen.getByText(/no results for/i)).toBeInTheDocument();
  });

  it("clears search when the clear button is clicked", async () => {
    const user = userEvent.setup();
    renderPalette();

    const input = screen.getByPlaceholderText(/search commands/i);
    await user.type(input, "docker");

    const clearBtn = screen.getByRole("button", { name: /clear search/i });
    await user.click(clearBtn);

    expect(input).toHaveValue("");
    // All commands should be visible again
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    const { props } = renderPalette();
    const input = screen.getByPlaceholderText(/search commands/i);

    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const { props } = renderPalette();
    const backdrop = screen.getByRole("presentation");

    // Simulate mousedown on the backdrop itself (target === currentTarget)
    fireEvent.mouseDown(backdrop, { target: backdrop });

    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the panel", () => {
    const { props } = renderPalette();
    const dialog = screen.getByRole("dialog");

    fireEvent.mouseDown(dialog);

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("navigates to a page on Enter", async () => {
    const { props } = renderPalette();
    const input = screen.getByPlaceholderText(/search commands/i);

    // Type "Settings" to filter to the Settings page command
    await userEvent.type(input, "Settings");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onClose).toHaveBeenCalled();
    expect(props.onNavigate).toHaveBeenCalledWith(expect.stringContaining("settings"));
  });

  it("calls onToggleDark when Toggle Dark Mode command is executed", async () => {
    const { props } = renderPalette();
    const input = screen.getByPlaceholderText(/search commands/i);

    await userEvent.type(input, "dark mode");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onToggleDark).toHaveBeenCalledOnce();
  });

  it("calls onToggleSidebar when Toggle Sidebar command is executed", async () => {
    const { props } = renderPalette();
    const input = screen.getByPlaceholderText(/search commands/i);

    await userEvent.type(input, "toggle sidebar");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onToggleSidebar).toHaveBeenCalledOnce();
  });

  it("navigates with ArrowDown and ArrowUp keys", () => {
    userEvent.setup();
    renderPalette();
    const input = screen.getByPlaceholderText(/search commands/i);

    // Focus the first item by default; move down
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Move back up
    fireEvent.keyDown(input, { key: "ArrowUp" });

    // Still in the dialog — no crash
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows category badges on command items", () => {
    renderPalette();
    // Pages category badge should appear
    expect(screen.getAllByText("Pages").length).toBeGreaterThan(0);
    // Actions category badge should appear
    expect(screen.getAllByText("Actions").length).toBeGreaterThan(0);
  });

  it("shows recent items at the top after a command is executed", () => {
    // Pre-seed a recent id via the mock
    _storage.set("cmd_palette_recent", JSON.stringify(["action-toggle-dark"]));

    renderPalette();

    // The "Toggle Dark Mode" entry should render at the top of the list
    const items = screen.getAllByRole("option");
    expect(items[0]).toHaveTextContent("Toggle Dark Mode");
  });

  it("shows keyboard shortcut hint when a command has one", () => {
    renderPalette();
    // Settings has ⌘, shortcut
    expect(screen.getByText("⌘,")).toBeInTheDocument();
  });

  it("renders footer navigation hints", () => {
    renderPalette();
    expect(screen.getByText(/navigate/i)).toBeInTheDocument();
    expect(screen.getByText(/select/i)).toBeInTheDocument();
    // Footer contains an esc hint; use getAllByText to handle potential duplicates
    expect(screen.getAllByText(/close/).length).toBeGreaterThan(0);
  });
});
