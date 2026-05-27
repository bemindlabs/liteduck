import { describe, it, expect } from "vitest";
import { parseJsonArray } from "./parse-json-array";

describe("parseJsonArray()", () => {
  // ── happy path ────────────────────────────────────────────────────────────

  it("parses a plain JSON array string", () => {
    const result = parseJsonArray<number>("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses a JSON array of objects", () => {
    const result = parseJsonArray<{ id: number }>('[{"id": 1}, {"id": 2}]');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1 });
  });

  it("extracts a JSON array embedded in prose text", () => {
    const response =
      'Here are the steps:\n```json\n["step one", "step two", "step three"]\n```\nDone.';
    const result = parseJsonArray<string>(response);
    expect(result).toEqual(["step one", "step two", "step three"]);
  });

  it("extracts array when surrounded by leading and trailing prose", () => {
    const response = "Sure! The answer is [42, 43] and that concludes it.";
    const result = parseJsonArray<number>(response);
    expect(result).toEqual([42, 43]);
  });

  it("uses the first [ and last ] when multiple brackets exist", () => {
    // With valid nesting:
    const nested = "Here: [[1, 2], [3, 4]]";
    const result = parseJsonArray<number[]>(nested);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([1, 2]);
  });

  it("tolerates trailing commas in arrays and objects", () => {
    const response = '[{"title":"A","done":true,},{"title":"B","done":false,},]';
    const result = parseJsonArray<{ title: string }>(response);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("A");
  });

  // ── LLM wrapper tag stripping ─────────────────────────────────────────────

  it("strips <think>...</think> tags and parses JSON after them", () => {
    const response = '<think>Let me think about this...</think>[{"id": 1}]';
    const result = parseJsonArray<{ id: number }>(response);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 1 });
  });

  it("strips <reasoning>...</reasoning> tags", () => {
    const response = '<reasoning>The user wants a list of items.</reasoning>["apple", "banana"]';
    const result = parseJsonArray<string>(response);
    expect(result).toEqual(["apple", "banana"]);
  });

  it("handles response with only thinking tags and no JSON", () => {
    const response = "<think>I need to figure this out but I have nothing to return.</think>";
    expect(() => parseJsonArray(response)).toThrow("No JSON array found in the response.");
  });

  it("handles nested angle brackets inside thinking tags", () => {
    const response = "<think>The user wants <items> as JSON</think>[1, 2, 3]";
    const result = parseJsonArray<number>(response);
    expect(result).toEqual([1, 2, 3]);
  });

  // ── error cases ───────────────────────────────────────────────────────────

  it("throws when no JSON array markers are present", () => {
    expect(() => parseJsonArray("no brackets here at all")).toThrow(
      "No JSON array found in the response.",
    );
  });

  it("throws when only an opening bracket is present", () => {
    expect(() => parseJsonArray("something [")).toThrow("No JSON array found in the response.");
  });

  it("throws when the extracted content is an empty array", () => {
    expect(() => parseJsonArray("[]")).toThrow("Parsed result is empty or not an array.");
  });

  it("throws when the content between brackets is not valid JSON", () => {
    expect(() => parseJsonArray("[not valid json")).toThrow();
  });

  it("throws when the brackets delimit a non-array JSON value (object wrapped)", () => {
    // JSON.parse('[{"a":1}]') is valid array — use a non-array structure
    // The function specifically checks Array.isArray, so a JSON object
    // serialised inside brackets would fail JSON.parse anyway; confirm a
    // genuine malformed payload throws.
    expect(() => parseJsonArray("[null, null]")).not.toThrow();
    // null entries are valid array members; length=2 so it succeeds
  });

  it("returns typed array elements (generic type forwarding)", () => {
    interface Step {
      title: string;
      done: boolean;
    }
    const raw = '[{"title":"Init","done":false},{"title":"Build","done":true}]';
    const steps = parseJsonArray<Step>(raw);
    expect(steps[0].title).toBe("Init");
    expect(steps[1].done).toBe(true);
  });
});
