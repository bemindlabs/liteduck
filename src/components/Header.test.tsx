import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

// The dialog plugin is used by WorkspaceSwitcher — mock it to avoid crashes
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

// Mock react-dom createPortal to render inline so portal content is queryable
vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock platform helper so native-only buttons render consistently
vi.mock("@/lib/platform", () => ({ hasNativeCapabilities: vi.fn(() => false) }));

// Mock workspace/settings Tauri wrappers
vi.mock("@/lib/workspace", () => ({ workspaceInit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(undefined),
  saveSetting: vi.fn().mockResolvedValue(undefined),
}));

import { Header } from "./Header";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AppModeProvider } from "@/contexts/AppModeContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<React.ComponentProps<typeof Header>> = {}) {
  return {
    isDark: false,
    onToggleDark: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    onToggleSidebar: vi.fn(),
    sidebarHidden: false,
    ...overrides,
  };
}

function renderHeader(overrides?: Partial<React.ComponentProps<typeof Header>>) {
  const props = makeProps(overrides);
  const result = render(
    <MemoryRouter>
      <WorkspaceProvider>
        <AppModeProvider>
          <Header {...props} />
        </AppModeProvider>
      </WorkspaceProvider>
    </MemoryRouter>,
  );
  return { ...result, props };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a header element", () => {
    renderHeader();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders the workspace switcher button", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /switch workspace/i })).toBeInTheDocument();
  });

  it("shows 'No workspace' when no workspace is set", () => {
    renderHeader();
    expect(screen.getByText(/no workspace/i)).toBeInTheDocument();
  });

  it("renders the command palette trigger button", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /open command palette/i })).toBeInTheDocument();
  });

  it("calls onOpenCommandPalette when command palette button is clicked", () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /open command palette/i }));
    expect(props.onOpenCommandPalette).toHaveBeenCalledOnce();
  });

  it("renders the dark mode toggle button", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /toggle dark mode/i })).toBeInTheDocument();
  });

  it("calls onToggleDark when dark mode toggle is clicked", () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /toggle dark mode/i }));
    expect(props.onToggleDark).toHaveBeenCalledOnce();
  });

  it("shows the hamburger menu button when sidebarHidden is true", () => {
    renderHeader({ sidebarHidden: true, onToggleSidebar: vi.fn() });
    expect(screen.getByRole("button", { name: /open sidebar/i })).toBeInTheDocument();
  });

  it("does not show the hamburger menu button when sidebarHidden is false", () => {
    renderHeader({ sidebarHidden: false });
    expect(screen.queryByRole("button", { name: /open sidebar/i })).not.toBeInTheDocument();
  });

  it("calls onToggleSidebar when hamburger button is clicked", () => {
    const { props } = renderHeader({ sidebarHidden: true });
    fireEvent.click(screen.getByRole("button", { name: /open sidebar/i }));
    expect(props.onToggleSidebar).toHaveBeenCalledOnce();
  });

  it("renders the mode switcher radio group", () => {
    renderHeader();
    expect(screen.getByRole("radiogroup", { name: /app mode/i })).toBeInTheDocument();
  });

  it("renders SOLO and TEAM mode options", () => {
    renderHeader();
    expect(screen.getByRole("radio", { name: /solo/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /team/i })).toBeInTheDocument();
  });

  it("renders the notification center bell button", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });
});
