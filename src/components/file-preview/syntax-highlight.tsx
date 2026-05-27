// ── Syntax theme colors ──────────────────────────────────────────────────────

const TOKEN_COLORS: Record<string, string> = {
  keyword: "text-purple-400",
  string: "text-emerald-400",
  comment: "text-[var(--color-muted-foreground)]",
  number: "text-amber-400",
  type: "text-sky-400",
  punctuation: "text-[var(--color-muted-foreground)]",
  function: "text-blue-400",
  property: "text-cyan-400",
  tag: "text-red-400",
  attribute: "text-amber-300",
  operator: "text-pink-400",
};

// ── Simple syntax highlighter ────────────────────────────────────────────────

const KEYWORDS = new Set([
  "import",
  "export",
  "from",
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "class",
  "extends",
  "new",
  "this",
  "super",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "instanceof",
  "async",
  "await",
  "yield",
  "of",
  "in",
  "default",
  "true",
  "false",
  "null",
  "undefined",
  "void",
  "delete",
  "pub",
  "fn",
  "use",
  "struct",
  "enum",
  "impl",
  "mod",
  "crate",
  "self",
  "match",
  "loop",
  "mut",
  "ref",
  "type",
  "interface",
  "readonly",
  "as",
  "is",
  "keyof",
]);

export function highlightLine(line: string, ext: string): React.ReactNode[] {
  if (!ext || ["md", "txt", "json", "csv"].includes(ext)) {
    return [line];
  }

  const nodes: React.ReactNode[] = [];
  // Simple regex-based tokenizer
  const re =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*|\/\*[\s\S]*?\*\/|\b\d+(?:\.\d+)?\b|[{}()[\];,.:=><!&|?+\-*/]+|\b[a-zA-Z_$]\w*\b|\s+)/g;
  let match: RegExpExecArray | null;
  let lastIdx = 0;

  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(line.slice(lastIdx, match.index));
    }
    const token = match[0];
    const key = `${match.index}`;

    if (token.startsWith("//") || token.startsWith("/*")) {
      nodes.push(
        <span key={key} className={TOKEN_COLORS.comment}>
          {token}
        </span>,
      );
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
      nodes.push(
        <span key={key} className={TOKEN_COLORS.string}>
          {token}
        </span>,
      );
    } else if (/^\d/.test(token)) {
      nodes.push(
        <span key={key} className={TOKEN_COLORS.number}>
          {token}
        </span>,
      );
    } else if (KEYWORDS.has(token)) {
      nodes.push(
        <span key={key} className={TOKEN_COLORS.keyword}>
          {token}
        </span>,
      );
    } else if (/^[A-Z]/.test(token)) {
      nodes.push(
        <span key={key} className={TOKEN_COLORS.type}>
          {token}
        </span>,
      );
    } else if (/^[{}()[\];,.:=><!&|?+\-*/]+$/.test(token)) {
      nodes.push(
        <span key={key} className={TOKEN_COLORS.punctuation}>
          {token}
        </span>,
      );
    } else {
      nodes.push(token);
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < line.length) {
    nodes.push(line.slice(lastIdx));
  }

  return nodes.length > 0 ? nodes : [line];
}
