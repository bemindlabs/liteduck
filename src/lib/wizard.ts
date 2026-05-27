import { getSetting, saveSetting } from "@/lib/settings";

/**
 * Returns true when the global wizard has never been completed
 * (first-ever app launch).
 */
export async function shouldShowWizard(): Promise<boolean> {
  try {
    const val = await getSetting("wizard_completed");
    return val !== "true";
  } catch {
    return true;
  }
}

/**
 * Returns true when the given workspace has not yet been through
 * the wizard. Used to trigger the wizard on first use of each
 * new workspace directory.
 */
export async function shouldShowWizardForWorkspace(workspace: string): Promise<boolean> {
  if (!workspace) return false;
  try {
    const raw = await getSetting("wizard_completed_workspaces");
    if (!raw) return true;
    const completed: unknown = JSON.parse(raw);
    if (!Array.isArray(completed)) return true;
    return !completed.includes(workspace);
  } catch {
    return true;
  }
}

/**
 * Mark a workspace as having completed the wizard so it won't
 * trigger again for this directory.
 */
export async function markWizardCompletedForWorkspace(workspace: string): Promise<void> {
  if (!workspace) return;
  try {
    const raw = await getSetting("wizard_completed_workspaces");
    let completed: string[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) completed = parsed as string[];
      } catch {
        // reset if corrupt
      }
    }
    if (!completed.includes(workspace)) {
      completed.push(workspace);
      await saveSetting("wizard_completed_workspaces", JSON.stringify(completed));
    }
  } catch {
    // best-effort
  }
}
