import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSetting, saveSetting } from "@/lib/settings";
import { createLogger } from "@/lib/logger";

const logger = createLogger("AppModeContext");

// ── Types ────────────────────────────────────────────────────────────────────

export type AppMode = "solo" | "team";

interface AppModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const AppModeContext = createContext<AppModeContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("solo");

  useEffect(() => {
    void getSetting("dev_mode")
      .then((val) => {
        if (val === "solo" || val === "team") {
          setModeState(val);
        } else if (val === "dev" || val === "docs") {
          setModeState("solo");
        } else if (val === "pm") {
          setModeState("team");
        }
      })
      .catch((err: unknown) => {
        logger.warn("Failed to load dev_mode setting", err);
      });
  }, []);

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    void saveSetting("dev_mode", next);
  }, []);

  return <AppModeContext.Provider value={{ mode, setMode }}>{children}</AppModeContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error("useAppMode must be used inside AppModeProvider");
  }
  return ctx;
}
