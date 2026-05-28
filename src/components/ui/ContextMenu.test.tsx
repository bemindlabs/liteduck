import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

function items(overrides: Partial<ContextMenuItem>[] = []): ContextMenuItem[] {
  const base: ContextMenuItem[] = [
    { label: "Copy", onSelect: vi.fn() },
    { label: "Paste", onSelect: vi.fn() },
  ];
  return overrides.length ? (overrides as ContextMenuItem[]) : base;
}

describe("ContextMenu", () => {
  it("renders a role=menu with menuitems and an aria-label", () => {
    render(<ContextMenu x={10} y={10} items={items()} onClose={vi.fn()} ariaLabel="Test menu" />);
    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("aria-label", "Test menu");
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("uses the popover background token", () => {
    render(<ContextMenu x={0} y={0} items={items()} onClose={vi.fn()} />);
    expect(screen.getByRole("menu").style.backgroundColor).toBe("var(--color-popover)");
  });

  it("runs onSelect and closes on click", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={[{ label: "Run", onSelect }]} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Run" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the menu open when an item sets keepOpen", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "Confirm?", onSelect: vi.fn(), keepOpen: true }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Confirm?" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("omits items with show:false", () => {
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          { label: "Shown", onSelect: vi.fn() },
          { label: "Hidden", onSelect: vi.fn(), show: false },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("menuitem", { name: "Hidden" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Shown" })).toBeInTheDocument();
  });

  it("does not fire onSelect for a disabled item", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "Nope", onSelect, disabled: true }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Nope" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on outside mousedown", () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items()} onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when every item is hidden", () => {
    const { container } = render(
      <ContextMenu
        x={0}
        y={0}
        items={[{ label: "x", onSelect: vi.fn(), show: false }]}
        onClose={vi.fn()}
      />,
    );
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});
