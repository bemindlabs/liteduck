import { useState, useCallback } from "react";

export interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
}

const DEFAULTS: ReadingSettings = {
  fontSize: 16,
  lineHeight: 1.8,
  maxWidth: 720,
};

const STORAGE_KEY = "reading_settings";

function isReadingSettingsPartial(v: unknown): v is Partial<ReadingSettings> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const ok = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  return (
    (o.fontSize === undefined || ok(o.fontSize)) &&
    (o.lineHeight === undefined || ok(o.lineHeight)) &&
    (o.maxWidth === undefined || ok(o.maxWidth))
  );
}

function load(): ReadingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (isReadingSettingsPartial(parsed)) {
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULTS;
}

function save(s: ReadingSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function useReadingSettings() {
  const [settings, setSettings] = useState<ReadingSettings>(load);

  const update = useCallback((partial: Partial<ReadingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      save(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    save(DEFAULTS);
    setSettings(DEFAULTS);
  }, []);

  return { settings, update, reset };
}
