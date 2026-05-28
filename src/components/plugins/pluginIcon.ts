/**
 * pluginIcon — resolve a plugin manifest's declared `icon` *name* to a built-in
 * lucide-react component.
 *
 * Charter note (ADR-001): a plugin only ever **names** a host-provided icon — it
 * never ships an SVG/asset and no plugin code runs. We look the name up in the
 * trusted `lucide-react` registry; nothing is `eval`'d. An unknown or absent
 * name falls back to the generic plugin icon (`Boxes`) so a manifest can never
 * produce a broken or blank rail entry.
 */

import { Boxes, icons, type LucideIcon } from "lucide-react";

/** The component used when an icon name is unknown or absent. */
export const FALLBACK_ICON: LucideIcon = Boxes;

/**
 * Normalize a manifest icon name to lucide's PascalCase registry key. Accepts
 * kebab-case (`square-kanban`), snake_case (`square_kanban`), or PascalCase
 * (`SquareKanban`) and returns `SquareKanban`. Returns `""` for empty input.
 */
export function toPascalIconKey(name: string): string {
  return name
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Resolve a plugin's declared icon name to a lucide component. Unknown/absent
 * names resolve to {@link FALLBACK_ICON}. Safe lookup only — no dynamic import,
 * no eval; the name merely keys the static lucide registry.
 */
export function resolvePluginIcon(name: string | undefined | null): LucideIcon {
  if (!name) return FALLBACK_ICON;
  const key = toPascalIconKey(name);
  if (!key) return FALLBACK_ICON;
  const registry = icons as unknown as Record<string, LucideIcon>;
  return registry[key] ?? FALLBACK_ICON;
}
