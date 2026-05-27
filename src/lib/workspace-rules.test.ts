import { describe, it, expect, beforeEach } from "vitest";
import { mockInvoke, mockInvokeResponse, resetTauriMocks } from "@/test/tauri-mocks";
import { loadWorkspaceRules, saveWorkspaceRules, DEFAULT_RULES } from "./workspace-rules";
import type { WorkspaceRules, AgentRule } from "./workspace-rules";

// workspace-rules uses filesReadText (files_read_text) and filesWriteText (files_write_text)
// and invoke("files_create_dir", ...) directly. All are routed through mockInvoke.

const WS = "/home/user/workspace";
const RULES_PATH = `${WS}/.LiteDuck/.agents/rules.json`;
const DIR_PATH = `${WS}/.LiteDuck/.agents`;

const makeRules = (overrides: Partial<WorkspaceRules> = {}): WorkspaceRules => ({
  ...DEFAULT_RULES,
  concurrency: 2,
  defaultMode: "terminal-agent",
  defaultAgentId: "codex",
  defaultSystemPrompt: "Be concise.",
  rules: [],
  ...overrides,
});

describe("DEFAULT_RULES", () => {
  it("has expected default values", () => {
    expect(DEFAULT_RULES.concurrency).toBe(3);
    expect(DEFAULT_RULES.defaultMode).toBe("ai-assistant");
    expect(DEFAULT_RULES.defaultAgentId).toBe("claude-code");
    expect(DEFAULT_RULES.defaultSystemPrompt).toBe("");
    expect(DEFAULT_RULES.rules).toEqual([]);
  });
});

describe("loadWorkspaceRules", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("reads rules.json and merges with defaults", async () => {
    const stored: WorkspaceRules = makeRules();
    mockInvoke.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "files_read_text" && (args as { path: string }).path === RULES_PATH) {
        return Promise.resolve(JSON.stringify(stored));
      }
      return Promise.resolve(undefined);
    });

    const result = await loadWorkspaceRules(WS);

    expect(mockInvoke).toHaveBeenCalledWith(
      "files_read_text",
      expect.objectContaining({ path: RULES_PATH }),
    );
    expect(result.concurrency).toBe(2);
    expect(result.defaultMode).toBe("terminal-agent");
    expect(result.defaultAgentId).toBe("codex");
  });

  it("returns DEFAULT_RULES when file does not exist", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("File not found"));

    const result = await loadWorkspaceRules(WS);

    expect(result).toEqual(DEFAULT_RULES);
  });

  it("returns DEFAULT_RULES when file contains invalid JSON", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "files_read_text") return Promise.resolve("invalid json {{");
      return Promise.resolve(undefined);
    });

    const result = await loadWorkspaceRules(WS);

    expect(result).toEqual(DEFAULT_RULES);
  });

  it("merges partial rules with defaults (missing fields are filled in)", async () => {
    const partial = { concurrency: 5 };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "files_read_text") return Promise.resolve(JSON.stringify(partial));
      return Promise.resolve(undefined);
    });

    const result = await loadWorkspaceRules(WS);

    expect(result.concurrency).toBe(5);
    expect(result.defaultMode).toBe(DEFAULT_RULES.defaultMode);
    expect(result.defaultAgentId).toBe(DEFAULT_RULES.defaultAgentId);
  });

  it("handles rules with AgentRule entries", async () => {
    const rule: AgentRule = {
      priority: "high",
      epicMatch: "auth",
      mode: "terminal-agent",
      agentId: "claude-code",
      systemPrompt: "",
    };
    const stored: WorkspaceRules = { ...DEFAULT_RULES, rules: [rule] };
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "files_read_text") return Promise.resolve(JSON.stringify(stored));
      return Promise.resolve(undefined);
    });

    const result = await loadWorkspaceRules(WS);

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].epicMatch).toBe("auth");
  });
});

describe("saveWorkspaceRules", () => {
  beforeEach(() => {
    resetTauriMocks();
  });

  it("creates directory and writes rules.json", async () => {
    mockInvokeResponse("files_create_dir", undefined);
    mockInvokeResponse("files_write_text", undefined);

    const rules = makeRules();
    await saveWorkspaceRules(WS, rules);

    const calls = mockInvoke.mock.calls as [string, unknown][];
    const dirCall = calls.find(([cmd]) => cmd === "files_create_dir");
    const writeCall = calls.find(([cmd]) => cmd === "files_write_text");

    expect(dirCall).toBeDefined();
    expect((dirCall![1] as { path: string }).path).toBe(DIR_PATH);

    expect(writeCall).toBeDefined();
    const writeArgs = writeCall![1] as { path: string; content: string };
    expect(writeArgs.path).toBe(RULES_PATH);
    const parsed = JSON.parse(writeArgs.content) as WorkspaceRules;
    expect(parsed.concurrency).toBe(2);
    expect(parsed.defaultMode).toBe("terminal-agent");
  });

  it("continues even when files_create_dir fails (catches error)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "files_create_dir") return Promise.reject(new Error("Permission denied"));
      if (cmd === "files_write_text") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    // Should not throw even if mkdir fails
    await expect(saveWorkspaceRules(WS, DEFAULT_RULES)).resolves.toBeUndefined();
  });

  it("writes prettified JSON with 2-space indent", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await saveWorkspaceRules(WS, DEFAULT_RULES);

    const calls = mockInvoke.mock.calls as [string, unknown][];
    const writeCall = calls.find(([cmd]) => cmd === "files_write_text");
    const content = (writeCall![1] as { content: string }).content;

    // JSON.stringify with 2-space indent produces newlines
    expect(content).toContain("\n");
    expect(content).toContain("  ");
  });
});
