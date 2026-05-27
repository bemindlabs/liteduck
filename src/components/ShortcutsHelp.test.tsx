import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import { ShortcutsHelp } from "./ShortcutsHelp";
import { DEFAULT_BINDINGS } from "@/hooks/useKeyboardShortcuts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<React.ComponentProps<typeof ShortcutsHelp>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    ...overrides,
  };
}

function renderHelp(overrides?: Partial<React.ComponentProps<typeof ShortcutsHelp>>) {
  const props = makeProps(overrides);
  const result = render(<ShortcutsHelp {...props} />);
  return { ...result, props };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ShortcutsHelp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    renderHelp({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open", () => {
    renderHelp();
    expect(screen.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it("renders the 'Keyboard Shortcuts' heading", () => {
    renderHelp();
    expect(screen.getByRole("heading", { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it("renders the Close button", () => {
    renderHelp();
    expect(screen.getByRole("button", { name: /close shortcuts help/i })).toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", () => {
    const { props } = renderHelp();
    fireEvent.click(screen.getByRole("button", { name: /close shortcuts help/i }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape key press", () => {
    const { props } = renderHelp();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const { props } = renderHelp();
    const backdrop = screen.getByRole("presentation");
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the panel", () => {
    const { props } = renderHelp();
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("renders the Navigation group heading", () => {
    renderHelp();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
  });

  it("renders the Terminal group heading", () => {
    renderHelp();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("renders the General group heading", () => {
    renderHelp();
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  it("renders shortcut labels from DEFAULT_BINDINGS", () => {
    renderHelp();
    // Pick a label that is guaranteed to exist in defaults
    const navigationBinding = DEFAULT_BINDINGS.find((b) => b.action === "navigate-terminal");
    if (navigationBinding) {
      expect(screen.getByText(navigationBinding.label)).toBeInTheDocument();
    }
  });

  it("renders custom bindings when provided", () => {
    const customBindings = [
      {
        action: "navigate-terminal" as const,
        label: "My Custom Terminal",
        description: "Go to terminal",
        key: "t",
        mod: true,
        shift: false,
      },
    ];
    renderHelp({ bindings: customBindings });
    expect(screen.getByText("My Custom Terminal")).toBeInTheDocument();
  });

  it("does not render a group section when it has no shortcuts", () => {
    // Provide bindings only for Navigation — Terminal and General sections should not appear
    const navOnly = DEFAULT_BINDINGS.filter(
      (b) => b.action === "navigate-terminal" || b.action === "navigate-git",
    );
    renderHelp({ bindings: navOnly });
    // Terminal and General groups should be absent
    expect(screen.queryByText("Terminal")).not.toBeInTheDocument();
    expect(screen.queryByText("General")).not.toBeInTheDocument();
  });

  it("renders the footer hint about Esc to close", () => {
    renderHelp();
    expect(screen.getByText(/shortcuts can be customised/i)).toBeInTheDocument();
  });

  it("shows keyboard shortcut key indicators (kbd elements)", () => {
    renderHelp();
    // At least one kbd element should be rendered for the shortcut hints
    const kbds = document.querySelectorAll("kbd");
    expect(kbds.length).toBeGreaterThan(0);
  });
});
