/**
 * Strip trailing commas before `]` or `}` — a common LLM JSON quirk that
 * `JSON.parse` rejects.
 */
function stripTrailingCommas(json: string): string {
  return json.replace(/,\s*([\]}])/g, "$1");
}

/**
 * Strip LLM wrapper tags such as `<think>…</think>`, `<reasoning>…</reasoning>`,
 * and `<output>…</output>` (including all content inside them).  Any text that
 * follows the closing tag is preserved — that is typically where the actual JSON
 * response lives.
 *
 * The regex uses the `s` (dotAll) flag so `.` matches newlines, allowing
 * multi-line thinking blocks to be removed in one pass.
 */
function stripLlmWrapperTags(text: string): string {
  // Case-insensitive (`i` flag) to handle <THINK>, <Thinking>, <Think>, etc.
  return text.replace(/<(think|thinking|reasoning|output|reflection)>.*?<\/\1>/gis, "");
}

/**
 * Extract and parse a JSON array from an AI response string.
 *
 * Tolerates markdown code fences and surrounding prose by finding the first `[`
 * and last `]` in the response.  Also strips trailing commas that LLMs
 * frequently emit, and removes common reasoning wrapper tags (`<think>`,
 * `<reasoning>`, `<output>`) emitted by models such as DeepSeek and Qwen.
 * This mirrors the Rust `try_parse_steps()` implementation so both frontend
 * CLI mode and backend gateway mode use identical parsing logic.
 */
export function parseJsonArray<T>(response: string): T[] {
  const stripped = stripLlmWrapperTags(response);
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON array found in the response.");
  }
  let slice = stripped.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    // Retry after stripping trailing commas
    slice = stripTrailingCommas(slice);
    parsed = JSON.parse(slice);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Parsed result is empty or not an array.");
  }
  return parsed as T[];
}
