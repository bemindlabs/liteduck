import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

describe("Button", () => {
  // -- Rendering --------------------------------------------------------------

  it("renders a <button> element by default", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("renders children as text content", () => {
    render(<Button>Save</Button>);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("renders as a Slot child when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/home">Home</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: /home/i });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
  });

  // -- Variants ---------------------------------------------------------------

  it.each(["default", "destructive", "outline", "secondary", "ghost", "link"] as const)(
    "renders variant '%s' without error",
    (variant) => {
      render(<Button variant={variant}>Button</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    },
  );

  // -- Sizes ------------------------------------------------------------------

  it.each(["default", "sm", "lg", "icon"] as const)("renders size '%s' without error", (size) => {
    render(<Button size={size}>B</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  // -- Class application ------------------------------------------------------

  it("applies additional className alongside variant classes", () => {
    render(<Button className="my-custom">Label</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("my-custom");
  });

  it("applies the default variant class when no variant prop is provided", () => {
    render(<Button>Default</Button>);
    // The default variant uses bg-[var(--color-primary)]; check for 'inline-flex' from cva base
    expect(screen.getByRole("button").className).toMatch(/inline-flex/);
  });

  // -- Interactions -----------------------------------------------------------

  it("calls onClick handler when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when the button is disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  // -- Disabled state ---------------------------------------------------------

  it("has the disabled attribute when disabled prop is set", () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does not have the disabled attribute by default", () => {
    render(<Button>On</Button>);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  // -- Forwarded ref ----------------------------------------------------------

  it("forwards a ref to the underlying button element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("BUTTON");
  });

  // -- Native HTML attributes -------------------------------------------------

  it("passes through type='submit' correctly", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("passes through aria-label", () => {
    render(<Button aria-label="close dialog">X</Button>);
    expect(screen.getByRole("button", { name: /close dialog/i })).toBeInTheDocument();
  });

  // -- displayName ------------------------------------------------------------

  it("has displayName set to 'Button'", () => {
    expect(Button.displayName).toBe("Button");
  });
});
