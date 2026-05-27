import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import { ErrorBoundary } from "./ErrorBoundary";

// ---------------------------------------------------------------------------
// Helper — a component that throws on demand
// ---------------------------------------------------------------------------

function ThrowingChild({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error("Test render error");
  return <div>Child rendered OK</div>;
}

// Suppress React's console.error for expected boundary errors
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ErrorBoundary", () => {
  it("renders children normally when there is no error", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Child rendered OK")).toBeInTheDocument();
  });

  it("does not show the error UI when there is no error", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("catches a render error and shows the fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("displays the error message in the fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Test render error")).toBeInTheDocument();
  });

  it("renders a Try Again button in the fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders a Reload App link in the fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/reload app/i)).toBeInTheDocument();
  });

  it("clears the error state and re-renders children when Try Again is clicked", () => {
    // We need a stateful wrapper so we can control shouldThrow after the first render
    let clickCount = 0;

    function RecoverableChild() {
      // Throw only on the very first render (before retry)
      if (clickCount === 0) throw new Error("Initial error");
      return <div>Recovered!</div>;
    }

    render(
      <ErrorBoundary>
        <RecoverableChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Simulate the child no longer throwing on next render
    clickCount = 1;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Recovered!")).toBeInTheDocument();
  });

  it("renders the error message paragraph element in the fallback UI", () => {
    // The component renders: this.state.error?.message ?? "An unexpected error occurred."
    // When the error has a message, it is shown in the <p> element.
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    // The <p> should contain the thrown error's message
    expect(screen.getByText("Test render error")).toBeInTheDocument();
  });

  it("hides child content after an error is caught", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.queryByText("Child rendered OK")).not.toBeInTheDocument();
  });
});
