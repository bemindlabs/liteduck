import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSuppressNativeContextMenu } from "./useSuppressNativeContextMenu";

function rightClick(target: EventTarget): boolean {
  const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(evt);
  return evt.defaultPrevented;
}

describe("useSuppressNativeContextMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prevents the native context menu on a plain element", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    renderHook(() => useSuppressNativeContextMenu());
    expect(rightClick(div)).toBe(true);
  });

  it("does NOT suppress inside a text input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    renderHook(() => useSuppressNativeContextMenu());
    expect(rightClick(input)).toBe(false);
  });

  it("does NOT suppress inside a textarea", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    renderHook(() => useSuppressNativeContextMenu());
    expect(rightClick(ta)).toBe(false);
  });

  it("removes the listener on unmount", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const { unmount } = renderHook(() => useSuppressNativeContextMenu());
    unmount();
    expect(rightClick(div)).toBe(false);
  });
});
