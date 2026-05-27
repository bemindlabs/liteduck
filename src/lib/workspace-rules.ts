import { invoke } from "@tauri-apps/api/core";
import { filesReadText, filesWriteText } from "@/lib/files";

// ── Types ────────────────────────────────────────────────────────────────────

export type AssignMode = "ai-assistant" | "terminal-agent" | "round-robin";

export interface AgentRule {
  /** Match stories by priority ("all", "critical", "high", "medium", "low"). */
  priority: string;
  /** Match stories by epic name substring (empty = all). */
  epicMatch: string;
  /** How to develop: AI chat, terminal agent, or round-robin across agents. */
  mode: AssignMode;
  /** Agent preset ID for terminal-agent mode (e.g. "claude-code"). */
  agentId: string;
  /** System prompt override for ai-assistant mode (empty = default). */
  systemPrompt: string;
}

export interface WorkspaceRules {
  /** Max parallel agents. */
  concurrency: number;
  /** Default assignment mode when no rule matches. */
  defaultMode: AssignMode;
  /** Default agent preset ID for terminal mode. */
  defaultAgentId: string;
  /** Custom system prompt for AI assistant mode (empty = built-in). */
  defaultSystemPrompt: string;
  /** Ordered rules — first match wins. */
  rules: AgentRule[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_RULES: WorkspaceRules = {
  concurrency: 3,
  defaultMode: "ai-assistant",
  defaultAgentId: "claude-code",
  defaultSystemPrompt: "",
  rules: [],
};

// ── File path ────────────────────────────────────────────────────────────────

function rulesPath(workspace: string): string {
  return `${workspace}/.LiteDuck/.agents/rules.json`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function loadWorkspaceRules(workspace: string): Promise<WorkspaceRules> {
  try {
    const raw = await filesReadText(rulesPath(workspace));
    const parsed = JSON.parse(raw) as Partial<WorkspaceRules>;
    return { ...DEFAULT_RULES, ...parsed };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export async function saveWorkspaceRules(workspace: string, rules: WorkspaceRules): Promise<void> {
  // Ensure parent directory exists via a mkdir invoke before writing
  const path = rulesPath(workspace);
  const dir = path.substring(0, path.lastIndexOf("/"));
  await invoke("files_create_dir", { path: dir }).catch(() => undefined);
  await filesWriteText(path, JSON.stringify(rules, null, 2));
}
