/**
 * CodeMirror theme + syntax highlight style for LiteDuck.
 *
 * The editor chrome (background, gutter, selection, caret, search panel) is bound to the
 * app's existing `--color-*` design tokens so the editor is visually identical to the rest
 * of the dark UI. The token colors for syntax mirror the palette of the previous custom
 * regex highlighter (keyword=purple, string=emerald, number=amber, type=sky, fn=blue) so the
 * migration to CodeMirror doesn't change how code looks.
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** Editor chrome — wired to the app design tokens. */
const liteDuckTheme = EditorView.theme(
  {
    "&": {
      color: "var(--color-foreground)",
      backgroundColor: "var(--color-background)",
      height: "100%",
      fontSize: "12px",
    },
    ".cm-content": {
      fontFamily:
        "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      caretColor: "var(--color-foreground)",
      padding: "0.5rem 0",
    },
    ".cm-scroller": {
      fontFamily:
        "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      lineHeight: "1.6",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-foreground)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--color-accent)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-card)",
      color: "var(--color-muted-foreground)",
      border: "none",
      borderRight: "1px solid var(--color-border)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--color-accent)",
      color: "var(--color-foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--color-accent) 35%, transparent)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--color-muted)",
      color: "var(--color-muted-foreground)",
      border: "none",
      padding: "0 0.25rem",
    },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "color-mix(in srgb, var(--color-primary) 30%, transparent)",
      outline: "1px solid var(--color-primary)",
    },
    ".cm-selectionMatch": {
      backgroundColor: "color-mix(in srgb, var(--color-primary) 22%, transparent)",
    },
    // Search panel — match the popover tokens.
    ".cm-panels": {
      backgroundColor: "var(--color-popover)",
      color: "var(--color-popover-foreground)",
      borderColor: "var(--color-border)",
    },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-border)" },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--color-border)" },
    ".cm-searchMatch": {
      backgroundColor: "color-mix(in srgb, var(--color-warning) 35%, transparent)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "color-mix(in srgb, var(--color-warning) 60%, transparent)",
    },
    ".cm-panel input, .cm-panel button, .cm-textfield": {
      backgroundColor: "var(--color-input)",
      color: "var(--color-foreground)",
      border: "1px solid var(--color-border)",
      borderRadius: "0.25rem",
    },
    ".cm-button": {
      backgroundColor: "var(--color-secondary)",
      backgroundImage: "none",
      color: "var(--color-secondary-foreground)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--color-popover)",
      color: "var(--color-popover-foreground)",
      border: "1px solid var(--color-border)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--color-accent)",
      color: "var(--color-accent-foreground)",
    },
  },
  { dark: true },
);

/** Syntax token colors — mirror the previous custom highlighter's palette. */
const liteDuckHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: "#c084fc" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#34d399" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: "var(--color-muted-foreground)",
    fontStyle: "italic",
  },
  { tag: [t.number, t.bool, t.null, t.literal], color: "#fbbf24" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: "#38bdf8" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "#60a5fa" },
  { tag: [t.propertyName, t.attributeName], color: "#7dd3fc" },
  { tag: [t.variableName, t.labelName], color: "var(--color-foreground)" },
  { tag: [t.definitionKeyword, t.self], color: "#c084fc" },
  {
    tag: [t.operator, t.punctuation, t.separator, t.bracket],
    color: "var(--color-muted-foreground)",
  },
  { tag: [t.propertyName, t.atom], color: "#fbbf24" },
  { tag: t.invalid, color: "var(--color-destructive)" },
  { tag: [t.heading, t.strong], fontWeight: "bold", color: "var(--color-foreground)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "#60a5fa", textDecoration: "underline" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

/** The full LiteDuck editor theme (chrome + syntax highlighting). */
export const liteDuckEditorTheme: Extension = [
  liteDuckTheme,
  syntaxHighlighting(liteDuckHighlightStyle),
];
