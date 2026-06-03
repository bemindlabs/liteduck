import { describe, it, expect, beforeEach } from "vitest";
import { getZoom, setZoom, zoomIn, zoomOut, resetZoom, initZoom } from "./fontZoom";

describe("fontZoom", () => {
  beforeEach(() => {
    localStorage.clear();
    resetZoom();
  });

  it("defaults to 1.0", () => {
    expect(getZoom()).toBe(1);
  });

  it("zooms in and out by 0.1 steps", () => {
    expect(zoomIn()).toBeCloseTo(1.1, 5);
    expect(zoomIn()).toBeCloseTo(1.2, 5);
    expect(zoomOut()).toBeCloseTo(1.1, 5);
  });

  it("clamps to the [0.7, 2.0] range", () => {
    setZoom(5);
    expect(getZoom()).toBe(2);
    setZoom(0.1);
    expect(getZoom()).toBe(0.7);
  });

  it("avoids floating-point drift across many steps", () => {
    setZoom(1);
    for (let i = 0; i < 3; i++) zoomIn();
    expect(getZoom()).toBeCloseTo(1.3, 5);
  });

  it("reset returns to 1.0", () => {
    setZoom(1.5);
    expect(resetZoom()).toBe(1);
    expect(getZoom()).toBe(1);
  });

  it("persists non-default zoom and restores it via initZoom", () => {
    setZoom(1.4);
    expect(localStorage.getItem("liteduck_zoom")).toBe("1.4");
    // Simulate a fresh load.
    initZoom();
    expect(getZoom()).toBeCloseTo(1.4, 5);
  });

  it("clears storage when reset to default", () => {
    setZoom(1.4);
    resetZoom();
    expect(localStorage.getItem("liteduck_zoom")).toBeNull();
  });

  it("applies the zoom to the document root", () => {
    setZoom(1.5);
    expect(document.documentElement.style.zoom).toBe("1.5");
    resetZoom();
    expect(document.documentElement.style.zoom).toBe("");
  });
});
