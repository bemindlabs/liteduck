/**
 * Language resolution for the CodeMirror editor.
 *
 * We resolve a file's language lazily from its name using `@codemirror/language-data`'s
 * `LanguageDescription` registry — each descriptor dynamically `import()`s its own grammar
 * package, so only the languages a user actually opens get loaded into the bundle.
 *
 * The priority languages (js/ts/rust/python/json/markdown/html/css/yaml) have their grammar
 * packages installed as direct dependencies, guaranteeing those dynamic imports resolve.
 */

import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

/**
 * Resolve and load the CodeMirror language support for a filename.
 *
 * Returns `null` when no language matches (the editor then renders as plain text).
 * Matching uses CodeMirror's own filename/extension table, so e.g. `Dockerfile`,
 * `*.tsx`, `*.rs`, `*.toml` all resolve correctly.
 */
export async function loadLanguageFor(filename: string): Promise<LanguageSupport | null> {
  const desc = LanguageDescription.matchFilename(languages, filename);
  if (!desc) return null;
  try {
    return await desc.load();
  } catch {
    // A grammar package failed to load (not installed / network) — fall back to plain text.
    return null;
  }
}

/**
 * Synchronous best-effort language name for a filename, used for the status bar.
 * Does not load any grammar.
 */
export function languageNameFor(filename: string): string | null {
  return LanguageDescription.matchFilename(languages, filename)?.name ?? null;
}
