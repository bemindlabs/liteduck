import {
  Shield,
  Terminal,
  FolderTree,
  HardDrive,
  Key,
  Globe,
  GitBranch,
  FolderOpen,
} from "lucide-react";

const PERMISSIONS = [
  {
    icon: Terminal,
    name: "Terminal / Shell Access",
    description: "Spawns PTY sessions to run shell commands",
    status: "granted" as const,
  },
  {
    icon: FolderTree,
    name: "File System",
    description: "Reads workspace files for the file browser and previews",
    status: "granted" as const,
  },
  {
    icon: HardDrive,
    name: "Local Storage (SQLite)",
    description: "Caches settings and runtime state in a local database",
    status: "granted" as const,
  },
  {
    icon: Key,
    name: "OS Keychain",
    description: "Securely stores API tokens and secrets in the system keychain",
    status: "granted" as const,
  },
  {
    icon: Globe,
    name: "Network Access",
    description: "Connects to the GitHub API and checks for app updates",
    status: "granted" as const,
  },
  {
    icon: GitBranch,
    name: "Git Repositories",
    description: "Reads and writes to git repositories in the workspace directory",
    status: "granted" as const,
  },
  {
    icon: FolderOpen,
    name: "File Dialogs",
    description: "Opens native folder/file picker dialogs for workspace selection",
    status: "granted" as const,
  },
];

export function PermissionsSection() {
  return (
    <section
      id="section-permissions"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4"
    >
      <div className="border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <h3 className="text-base font-medium text-[var(--color-foreground)]">App Permissions</h3>
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          System resources this application accesses.
        </p>
      </div>

      <div className="space-y-1">
        {PERMISSIONS.map((perm) => (
          <div
            key={perm.name}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-[var(--color-accent)]"
          >
            <perm.icon className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-foreground)]">{perm.name}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">{perm.description}</p>
            </div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-success bg-success-subtle">
              Granted
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
