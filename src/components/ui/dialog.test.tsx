import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog, DialogBackdrop, DialogPanel } from "./dialog";

describe("DialogBackdrop", () => {
  it("renders children", () => {
    render(
      <DialogBackdrop>
        <span>content</span>
      </DialogBackdrop>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("uses semi-transparent backdrop (not opaque bg)", () => {
    const { container } = render(
      <DialogBackdrop>
        <span>x</span>
      </DialogBackdrop>,
    );
    const backdrop = container.firstChild as HTMLElement;
    expect(backdrop.className).toContain("bg-black/60");
    expect(backdrop.className).not.toContain("bg-[var(--color-background)]");
  });

  it("calls onClose when clicking the backdrop itself", () => {
    const onClose = vi.fn();
    const { container } = render(
      <DialogBackdrop onClose={onClose}>
        <span>x</span>
      </DialogBackdrop>,
    );
    fireEvent.mouseDown(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when clicking child content", () => {
    const onClose = vi.fn();
    render(
      <DialogBackdrop onClose={onClose}>
        <span data-testid="child">content</span>
      </DialogBackdrop>,
    );
    fireEvent.mouseDown(screen.getByTestId("child"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("centers content by default", () => {
    const { container } = render(
      <DialogBackdrop>
        <span>x</span>
      </DialogBackdrop>,
    );
    expect((container.firstChild as HTMLElement).className).toContain("items-center");
  });

  it("aligns to top when align='top'", () => {
    const { container } = render(
      <DialogBackdrop align="top">
        <span>x</span>
      </DialogBackdrop>,
    );
    expect((container.firstChild as HTMLElement).className).toContain("items-start");
  });
});

describe("DialogPanel", () => {
  it("renders as role=dialog with aria-modal", () => {
    render(
      <DialogPanel aria-label="Test dialog">
        <p>Hello</p>
      </DialogPanel>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test dialog");
  });

  it("uses popover background via inline style (not Tailwind class)", () => {
    render(
      <DialogPanel aria-label="Test">
        <p>content</p>
      </DialogPanel>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.backgroundColor).toBe("var(--color-popover)");
  });

  it("stops mouseDown propagation (so backdrop dismiss works)", () => {
    const onClose = vi.fn();
    render(
      <DialogBackdrop onClose={onClose}>
        <DialogPanel aria-label="Test">
          <p>panel content</p>
        </DialogPanel>
      </DialogBackdrop>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies custom size class", () => {
    render(
      <DialogPanel aria-label="Test" size="max-w-lg">
        <p>x</p>
      </DialogPanel>,
    );
    expect(screen.getByRole("dialog").className).toContain("max-w-lg");
  });
});

describe("Dialog (composed)", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <Dialog open={false} onClose={vi.fn()} aria-label="Hidden">
        <p>hidden</p>
      </Dialog>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open=true", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="Visible">
        <p>visible</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Esc test">
        <p>esc</p>
      </Dialog>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when clicking backdrop", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Backdrop test">
        <p>click outside</p>
      </Dialog>,
    );
    // The backdrop is role=presentation
    const backdrop = screen.getByRole("presentation");
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when clicking inside the panel", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} aria-label="Panel test">
        <p>inside</p>
      </Dialog>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses popover background inline style", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} aria-label="BG test">
        <p>x</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.backgroundColor).toBe("var(--color-popover)");
  });
});
