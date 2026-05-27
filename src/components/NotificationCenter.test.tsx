import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NotificationCenter } from "./NotificationCenter";
import { addNotification, clearAll } from "@/lib/notifications";

// Mock createPortal to render inline (jsdom doesn't support portals properly)
vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

function renderNotificationCenter() {
  return render(
    <MemoryRouter>
      <NotificationCenter />
    </MemoryRouter>,
  );
}

describe("NotificationCenter", () => {
  beforeEach(() => {
    clearAll();
  });

  it("renders the bell button", () => {
    renderNotificationCenter();
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });

  it("shows unread badge when there are unread notifications", () => {
    addNotification("system", "Test", "Hello");
    renderNotificationCenter();
    // Badge should show count
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("opens dropdown panel on bell click", async () => {
    const user = userEvent.setup();
    renderNotificationCenter();

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByRole("dialog", { name: /notification center/i })).toBeInTheDocument();
  });

  it("dropdown uses popover background (inline style, not Tailwind class)", async () => {
    const user = userEvent.setup();
    renderNotificationCenter();
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    const dialog = screen.getByRole("dialog", { name: /notification center/i });
    expect(dialog.style.backgroundColor).toBe("var(--color-popover)");
  });

  it("backdrop is transparent (not opaque colored)", async () => {
    const user = userEvent.setup();
    const { container } = renderNotificationCenter();
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    // The click-catcher div should NOT have bg-black/60 or bg-[var(--color-background)]
    // It should be a transparent overlay
    const backdrop = container.querySelector(".fixed.inset-0");
    if (backdrop) {
      expect(backdrop.className).not.toContain("bg-black/60");
      expect(backdrop.className).not.toContain("bg-[var(--color-background)]");
    }
  });

  it("closes on Escape key", async () => {
    const user = userEvent.setup();
    renderNotificationCenter();
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows empty state when no notifications", async () => {
    const user = userEvent.setup();
    renderNotificationCenter();
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });
});
