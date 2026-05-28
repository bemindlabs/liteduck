import {
  Shield,
  Terminal,
  FolderTree,
  HardDrive,
  Key,
  Globe,
  GitBranch,
  FolderOpen,
  HelpCircle,
} from "lucide-react";

// NOTE: this section is currently informational only — no backend command
// exists yet to report live OS-level permission state. The rows describe
// which system resources LiteDuck declares it needs; status is reported as
// "Unknown" until a Tauri command is wired in.
// TODO: backend wiring pending — see src-tauri/src/lib.rs `generate_handler!`
// (no `permission_*` command registered today).
const PERMISSIONS = [
  {
    icon: Terminal,
    name: "Terminal / Shell Access",
    description: "Spawns PTY sessions to run shell commands",
  },
  {
    icon: FolderTree,
    name: "File System",
    description: "Reads workspace files for the file browser and previews",
  },
  {
    icon: HardDrive,
    name: "Local Storage (SQLite)",
    description: "Caches settings and runtime state in a local database",
  },
  {
    icon: Key,
    name: "OS Keychain",
    description: "Securely stores API tokens and secrets in the system keychain",
  },
  {
    icon: Globe,
    name: "Network Access",
    description: "Connects to the GitHub API and checks for app updates",
  },
  {
    icon: GitBranch,
    name: "Git Repositories",
    description: "Reads and writes to git repositories in the workspace directory",
  },
  {
    icon: FolderOpen,
    name: "File Dialogs",
    description: "Opens native folder/file picker dialogs for workspace selection",
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
          <h3 className="text-base font-medium text-[var(--color-foreground)]">
            Required Permissions
          </h3>
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          System resources this application accesses. Live status reporting is not yet wired
          to the backend.
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
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted-foreground)]"
              title="Live permission status not yet wired — informational only"
            >
              <HelpCircle className="h-3 w-3" />
              Unknown
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
