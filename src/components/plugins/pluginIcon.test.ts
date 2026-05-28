import { describe, it, expect } from "vitest";
import { Boxes, SquareKanban, Users } from "lucide-react";
import { FALLBACK_ICON, resolvePluginIcon, toPascalIconKey } from "./pluginIcon";

describe("toPascalIconKey", () => {
  it("converts kebab-case to PascalCase", () => {
    expect(toPascalIconKey("square-kanban")).toBe("SquareKanban");
  });

  it("converts snake_case to PascalCase", () => {
    expect(toPascalIconKey("square_kanban")).toBe("SquareKanban");
  });

  it("passes a single lowercase word through capitalized", () => {
    expect(toPascalIconKey("users")).toBe("Users");
  });

  it("leaves PascalCase intact", () => {
    expect(toPascalIconKey("SquareKanban")).toBe("SquareKanban");
  });

  it("returns empty string for empty / whitespace input", () => {
    expect(toPascalIconKey("")).toBe("");
    expect(toPascalIconKey("   ")).toBe("");
  });
});

describe("resolvePluginIcon", () => {
  it("resolves a known kebab name to the lucide component (square-kanban → SquareKanban)", () => {
    expect(resolvePluginIcon("square-kanban")).toBe(SquareKanban);
  });

  it("resolves a known lowercase name (users → Users)", () => {
    expect(resolvePluginIcon("users")).toBe(Users);
  });

  it("falls back to the generic plugin icon for an unknown name", () => {
    expect(resolvePluginIcon("definitely-not-a-real-icon")).toBe(FALLBACK_ICON);
    expect(FALLBACK_ICON).toBe(Boxes);
  });

  it("falls back when the name is absent (undefined / null / empty)", () => {
    expect(resolvePluginIcon(undefined)).toBe(FALLBACK_ICON);
    expect(resolvePluginIcon(null)).toBe(FALLBACK_ICON);
    expect(resolvePluginIcon("")).toBe(FALLBACK_ICON);
  });
});
