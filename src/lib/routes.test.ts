import { describe, it, expect } from "vitest";
import { ROUTES, type RoutePath } from "./routes";

describe("routes", () => {
  it("exposes stable path constants", () => {
    expect(ROUTES.HOME).toBe("/");
    expect(ROUTES.TERMINAL).toBe("/terminal");
    expect(ROUTES.FILES).toBe("/files");
    expect(ROUTES.GIT).toBe("/git");
    expect(ROUTES.SETTINGS).toBe("/settings");
  });

  it("contains only string route paths", () => {
    const values = Object.values(ROUTES);

    expect(values.length).toBeGreaterThan(5);
    expect(values.every((value) => typeof value === "string" && value.startsWith("/"))).toBe(true);
  });

  it("supports RoutePath values derived from ROUTES", () => {
    const route: RoutePath = ROUTES.FILES;

    expect(route).toBe("/files");
  });
});
