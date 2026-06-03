/**
 * CodeEditor — a thin, controlled React wrapper around a CodeMirror 6 `EditorView`.
 *
 * Replaces the previous `<textarea>` + custom-regex-highlight overlay. It brings the
 * standard editor features that overlay could never offer: real language-aware syntax
 * highlighting (lazy-loaded grammars), find/replace (Cmd+F), undo/redo history,
 * bracket matching + auto-close, smart indent, code folding, and multi-cursor.
 *
 * Controlled: the parent owns the text via `value` / `onChange`. An imperative handle
 * (see {@link CodeEditorHandle}) lets the markdown toolbar mutate the selection.
 */

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import { liteDuckEditorTheme } from "@/lib/editor/theme";
import { loadLanguageFor } from "@/lib/editor/language";

// ── Imperative handle ───────────────────────────────────────────────────────

export interface CodeEditorHandle {
  /** Wrap the current selection with `before`/`after` (e.g. ** ** for bold). */
  wrapSelection(before: string, after: string): void;
  /** Prefix each selected line (e.g. "# " for a heading, "- " for a list). */
  prefixLines(prefix: string): void;
  /** Insert text at the cursor, replacing any selection. */
  insertText(text: string): void;
  /** Move keyboard focus into the editor. */
  focus(): void;
  /** Open the find/replace panel. */
  openSearch(): void;
}

// ── Props ─────────────────────────────────────────────────────────────────

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** File name — drives lazy language detection. */
  filename?: string;
  readOnly?: boolean;
  /** Invoked on Cmd/Ctrl+S. */
  onSave?: () => void;
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, filename, readOnly = false, onSave, className },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageComp = useRef(new Compartment());
  const readOnlyComp = useRef(new Compartment());
  // Keep the latest callbacks in refs so the editor instance never goes stale
  // without us tearing it down and losing cursor/scroll/undo state.
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Build the editor once on mount.
  useLayoutEffect(() => {
    if (!hostRef.current) return;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          onSaveRef.current?.();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of("  "),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        EditorView.lineWrapping,
        saveKeymap,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        liteDuckEditorTheme,
        languageComp.current.of([]),
        readOnlyComp.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Editor is created once; subsequent prop changes are applied via effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (file switch, revert) into the doc without
  // disturbing the cursor when the text already matches.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Reconfigure read-only state.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyComp.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  // Lazily load + apply the language grammar for the current filename.
  useEffect(() => {
    let cancelled = false;
    if (!filename) {
      viewRef.current?.dispatch({ effects: languageComp.current.reconfigure([]) });
      return;
    }
    void loadLanguageFor(filename).then((lang) => {
      if (cancelled || !viewRef.current) return;
      viewRef.current.dispatch({
        effects: languageComp.current.reconfigure(lang ? [lang] : []),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filename]);

  useImperativeHandle(
    ref,
    (): CodeEditorHandle => ({
      wrapSelection(before, after) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const selected = view.state.sliceDoc(from, to);
        view.dispatch({
          changes: { from, to, insert: `${before}${selected}${after}` },
          selection: { anchor: from + before.length, head: from + before.length + selected.length },
        });
        view.focus();
      },
      prefixLines(prefix) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const startLine = view.state.doc.lineAt(from).number;
        const endLine = view.state.doc.lineAt(to).number;
        const changes = [];
        for (let n = startLine; n <= endLine; n++) {
          const line = view.state.doc.line(n);
          changes.push({ from: line.from, insert: prefix });
        }
        view.dispatch({ changes });
        view.focus();
      },
      insertText(text) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
      openSearch() {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
        // openSearchPanel is bound to Mod-f in searchKeymap; trigger it directly.
        void import("@codemirror/search").then(({ openSearchPanel }) => openSearchPanel(view));
      },
    }),
    [],
  );

  return <div ref={hostRef} className={className} style={{ height: "100%", overflow: "hidden" }} />;
});
