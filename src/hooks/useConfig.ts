import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { homeConfigWrite, homeResolveConfig, type Config } from "@/lib/home";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { createLogger } from "@/lib/logger";

const logger = createLogger("useConfig");

// ── useConfig ──────────────────────────────────────────────────────────────────

/**
 * Reactive config hook. Reads the merged config (workspace → global → defaults)
 * on mount and re-reads whenever a `config-changed` Tauri event fires.
 *
 * The hook deliberately **does not** replace `getSetting`/`saveSetting` — that
 * migration is a separate concern tracked in LD-44.
 */
export function useConfig() {
  const { workspace } = useWorkspace();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const resolved = await homeResolveConfig(workspace !== "" ? workspace : undefined);
      setConfig(resolved);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  // Initial load and reload when workspace changes.
  useEffect(() => {
    void reload();
  }, [reload]);

  // Subscribe to config-changed events so every write (from any window or
  // component) keeps this hook in sync automatically.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<{ source: string }>("config-changed", () => {
      void reload();
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((e: unknown) => {
        logger.warn("Failed to subscribe to config-changed", e);
      });

    return () => {
      unlisten?.();
    };
  }, [reload]);

  return { config, loading, error, reload };
}

// ── useConfigSection ───────────────────────────────────────────────────────────

/**
 * Convenience hook that exposes a single config section with a typed setter.
 *
 * Usage:
 * ```typescript
 * const { value: ai, update } = useConfigSection("ai");
 * await update({ default_model: "gpt-4o" });
 * ```
 *
 * Calling `update` merges the partial into the current config and persists it
 * via `home_config_write`. The backend emits `config-changed`, which causes
 * this hook (and every other `useConfig` instance) to re-read automatically.
 */
export function useConfigSection<K extends keyof Config>(section: K) {
  const { config, loading, error, reload } = useConfig();

  // Capture a stable reference to config so the update callback does not need
  // to re-create on every render — we read through the ref at call time.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const update = useCallback(
    async (partial: Partial<Config[K]>) => {
      const current = configRef.current;
      if (!current) return;
      const updated: Config = {
        ...current,
        [section]: { ...current[section], ...partial },
      };
      await homeConfigWrite(updated);
      // The backend emits config-changed which triggers reload via the listener.
    },
    [section],
  );

  return {
    value: config ? config[section] : null,
    loading,
    error,
    update,
    reload,
  };
}
