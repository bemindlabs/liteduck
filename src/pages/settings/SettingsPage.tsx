import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Settings2,
  Save,
  RotateCcw,
  Loader2,
  Wand2,
  Palette,
  FolderTree,
  GitBranch,
  Keyboard,
  Fingerprint,
  ScanFace,
  Shield,
  Boxes,
  Download,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/routes";
import { getSettings, getSecrets, saveSetting, deleteSetting } from "@/lib/settings";
import { workspaceInit } from "@/lib/workspace";
import { useBiometric } from "@/contexts/BiometricContext";
import { createLogger } from "@/lib/logger";

import { GeneralSection } from "./sections/GeneralSection";
import { WorkspaceSection } from "./sections/WorkspaceSection";
import { GitSection } from "./sections/GitSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { IdentitySection } from "./sections/IdentitySection";
import { BiometricSection } from "./sections/BiometricSection";
import { IntegrationsSection } from "./sections/IntegrationsSection";
import { PermissionsSection } from "./sections/PermissionsSection";
import { AboutSection } from "./sections/AboutSection";
import { DangerZoneSection } from "./sections/DangerZoneSection";

const logger = createLogger("SettingsPage");

// All setting keys that need to be loaded from storage
const PLAIN_KEYS = [
  "theme",
  "workspace_directory",
  "clone_parent_directory",
  // General / appearance
  "font_family",
  "font_size",
  "sidebar_position",
  "terminal_shell",
  "terminal_scrollback",
  // Git scan
  "git_scan_exclude_patterns",
];

const SECRET_KEYS: string[] = [];

type SaveStatus = "idle" | "saving" | "saved" | "error";

// ── Nav items ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "general", label: "General", icon: Palette },
  { id: "workspace", label: "Workspace", icon: FolderTree },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "identity", label: "Device Identity", icon: Fingerprint },
  { id: "biometric", label: "Biometric Lock", icon: ScanFace },
  { id: "integrations", label: "Integrations", icon: Boxes },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "about", label: "About", icon: Download },
  { id: "danger", label: "Danger Zone", icon: TriangleAlert },
] as const;

type NavId = (typeof NAV_ITEMS)[number]["id"];

// ── Sidebar Nav ───────────────────────────────────────────────────────────────

function NavButton({
  item,
  isActive,
  onSelect,
}: {
  item: (typeof NAV_ITEMS)[number];
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
        isActive
          ? "bg-[var(--color-accent)] text-[var(--color-foreground)] font-medium"
          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
    </button>
  );
}

function SidebarNav({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
      {NAV_ITEMS.map((item) => (
        <NavButton key={item.id} item={item} isActive={activeId === item.id} onSelect={onSelect} />
      ))}
    </nav>
  );
}

// ── Status Banner ─────────────────────────────────────────────────────────────

function StatusBanner({ status, errorMessage }: { status: SaveStatus; errorMessage: string }) {
  if (status === "idle") return null;

  const configs = {
    saving: {
      text: "Saving...",
      classes:
        "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)]",
      icon: <RotateCcw className="h-4 w-4 animate-spin" />,
    },
    saved: {
      text: "Settings saved successfully.",
      classes: "border-success/30 text-success bg-success-subtle",
      icon: null,
    },
    error: {
      text: errorMessage || "An error occurred while saving.",
      classes:
        "border-[var(--color-border)] bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]",
      icon: null,
    },
  };

  const cfg = configs[status];
  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", cfg.classes)}>
      {cfg.icon}
      <span>{cfg.text}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeSection, setActiveSection] = useState<NavId>("general");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { enabled: bioEnabled, unlocked: bioUnlocked, unlock: bioUnlock } = useBiometric();

  // ── Load settings on mount ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const canLoadSecrets = !bioEnabled || bioUnlocked;
        const secretKeys = canLoadSecrets ? SECRET_KEYS : [];

        const [plain, secrets] = await Promise.all([
          getSettings(),
          secretKeys.length > 0
            ? getSecrets(secretKeys)
            : Promise.resolve({} as Record<string, string>),
        ]);

        if (cancelled) return;

        const normalised: Record<string, string> = {};
        for (const key of secretKeys) {
          normalised[key] = secrets[key] ?? "";
        }

        setValues({ ...plain, ...normalised });
      } catch (err) {
        if (!cancelled) logger.error("Failed to load settings:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [bioEnabled, bioUnlocked]);

  // ── Intersection observer ─────────────────────────────────────────────────

  useEffect(() => {
    const allIds = NAV_ITEMS.map((n) => n.id);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace("section-", "") as NavId;
            setActiveSection(id);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    for (const id of allIds) {
      const el = document.getElementById(`section-${id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [loading]);

  // ── Scroll to section ─────────────────────────────────────────────────────

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveSection(id as NavId);
  }, []);

  // Deep-link via hash, e.g. /settings#git scrolls to that section after the
  // sections have mounted. `location.key` is included so re-clicks with the
  // same hash still re-fire the effect.
  const location = useLocation();
  useEffect(() => {
    if (loading) return;
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return;

    const navId = hash.startsWith("section-") ? hash.slice("section-".length) : hash;
    if (NAV_ITEMS.some((n) => n.id === navId)) {
      const el = document.getElementById(`section-${navId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSection(navId as NavId);
      }
    }
  }, [loading, location.hash, location.key]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleDeleteSecret = useCallback(async (key: string) => {
    try {
      await deleteSetting(key, true);
      setValues((prev) => ({ ...prev, [key]: "" }));
    } catch (err) {
      logger.error(`Failed to delete secret "${key}":`, err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    setErrorMessage("");

    try {
      // Check if there are any non-empty secret values
      const hasSecrets = SECRET_KEYS.some((k) => (values[k] ?? "") !== "");

      if (hasSecrets && bioEnabled && !bioUnlocked) {
        const ok = await bioUnlock();
        if (!ok) throw new Error("Biometric authentication required to save secrets");
      }

      // Clamp numeric ranges before persisting (font_size 10–24, scrollback 100–50000).
      // Build a payload copy so we never mutate the values state directly.
      const payload: Record<string, string> = { ...values };
      const fontSize = parseInt(payload.font_size, 10);
      if (!Number.isNaN(fontSize)) {
        payload.font_size = String(Math.min(24, Math.max(10, fontSize)));
      }
      const scrollback = parseInt(payload.terminal_scrollback, 10);
      if (!Number.isNaN(scrollback)) {
        payload.terminal_scrollback = String(Math.min(50000, Math.max(100, scrollback)));
      }
      if (
        payload.font_size !== values.font_size ||
        payload.terminal_scrollback !== values.terminal_scrollback
      ) {
        setValues(payload);
      }

      // Save plain keys
      await Promise.all(PLAIN_KEYS.map((key) => saveSetting(key, payload[key] ?? "", false)));

      // Save secret keys (skip empty)
      await Promise.all(
        SECRET_KEYS.map((key) => {
          const value = payload[key] ?? "";
          if (value === "") return Promise.resolve();
          return saveSetting(key, value, true);
        }),
      );

      // Auto-initialize workspace templates
      const wsDir = payload.workspace_directory;
      if (wsDir) {
        workspaceInit(wsDir).catch(() => {
          /* noop */
        });
      }

      // Apply theme immediately
      const themeVal = payload.theme;
      if (themeVal === "light" || themeVal === "dark" || themeVal === "system") {
        let dark: boolean;
        if (themeVal === "system") {
          dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        } else {
          dark = themeVal === "dark";
        }
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.classList.toggle("light", !dark);
      }

      setSaveStatus("saved");
      saveTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setSaveStatus("error");
    }
  }, [values, bioEnabled, bioUnlocked, bioUnlock]);

  // ── Cmd/Ctrl+S ────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const navigate = useNavigate();

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-44 lg:w-48 shrink-0 flex-col gap-4 pt-1 sticky top-0 self-start">
        <div className="flex items-center gap-2 px-3">
          <Settings2 className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <span className="text-sm font-semibold text-[var(--color-foreground)]">Settings</span>
        </div>
        <SidebarNav activeId={activeSection} onSelect={scrollToSection} />
        <div className="mt-auto px-3 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(ROUTES.WIZARD)}
            className="w-full justify-start gap-1.5 text-xs"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Setup Wizard
          </Button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="w-full space-y-6 px-1 pb-6">
          {/* Page header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-[var(--color-foreground)]">Settings</h2>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Manage application preferences and workspace configuration.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(ROUTES.WIZARD)}
              className="shrink-0 gap-1.5 lg:hidden"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Setup Wizard
            </Button>
          </div>

          {/* Status banner */}
          <StatusBanner status={saveStatus} errorMessage={errorMessage} />

          <GeneralSection
            values={values}
            onChange={handleChange}
            onDeleteSecret={handleDeleteSecret}
          />
          <WorkspaceSection
            values={values}
            onChange={handleChange}
            onDeleteSecret={handleDeleteSecret}
          />
          <GitSection values={values} onChange={handleChange} />
          <ShortcutsSection onSaved={() => setSaveStatus("saved")} />
          <IdentitySection />
          <BiometricSection />
          <IntegrationsSection />
          <PermissionsSection />
          <AboutSection />
          <DangerZoneSection />
        </div>

        {/* Save footer */}
        <footer className="sticky bottom-0 z-30 w-full border-t border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2 shrink-0">
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-muted-foreground)]">
                {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
                {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+S
              </kbd>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                disabled={saveStatus === "saving"}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className="gap-1.5"
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saveStatus === "saving" ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
