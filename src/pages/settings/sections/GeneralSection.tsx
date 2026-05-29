import { Palette } from "lucide-react";
import { SettingField, type FieldDef } from "../components/SettingField";

// Inline numeric range guards. Save still proceeds (the page-level handler
// clamps before persisting) — this only surfaces a helper hint.
const NUMERIC_RANGES: Record<string, { min: number; max: number }> = {
  font_size: { min: 10, max: 24 },
  terminal_scrollback: { min: 100, max: 50000 },
};

function validateNumericRange(key: string, raw: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(NUMERIC_RANGES, key) || raw === "") return null;
  const range = NUMERIC_RANGES[key];
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return `Must be a whole number between ${range.min} and ${range.max}.`;
  }
  if (n < range.min || n > range.max) {
    return `Out of range (${range.min}–${range.max}). Will be clamped on save.`;
  }
  return null;
}

const FIELDS: FieldDef[] = [
  {
    key: "theme",
    label: "Theme",
    type: "select",
    options: [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" },
      { value: "system", label: "System" },
    ],
    helpText: "Controls the colour scheme of the application.",
  },
  {
    key: "font_family",
    label: "Editor Font",
    placeholder: "JetBrains Mono",
    helpText: "Font family for terminal and code editors.",
  },
  {
    key: "font_size",
    label: "Font Size",
    placeholder: "14",
    helpText: "Base font size in pixels for terminals and editors (10–24).",
  },
  {
    key: "sidebar_position",
    label: "Sidebar Position",
    type: "select",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
    helpText: "Which side the navigation sidebar appears on.",
  },
  {
    key: "terminal_shell",
    label: "Terminal Shell",
    placeholder: "/bin/zsh",
    helpText: "Default shell for new terminal sessions.",
  },
  {
    key: "terminal_scrollback",
    label: "Scrollback Lines",
    placeholder: "10000",
    helpText: "Number of scrollback lines retained per terminal session (100–50000).",
  },
];

interface GeneralSectionProps {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onDeleteSecret: (key: string) => void;
}

export function GeneralSection({ values, onChange, onDeleteSecret }: GeneralSectionProps) {
  return (
    <section
      id="section-general"
      className="scroll-mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-5"
    >
      <div className="border-b border-[var(--color-border)] pb-3">
        <h3 className="flex items-center gap-2 text-base font-medium text-[var(--color-foreground)]">
          <Palette className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          General
        </h3>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          Application-wide preferences.
        </p>
      </div>

      <div className="space-y-4">
        {FIELDS.map((field) => {
          const value = values[field.key] ?? "";
          const validationError = validateNumericRange(field.key, value);
          return (
            <div key={field.key} className="space-y-1.5">
              <SettingField def={field} value={value} onChange={onChange} error={validationError} />
              {field.isSecret && values[field.key] && (
                <button
                  type="button"
                  onClick={() => onDeleteSecret(field.key)}
                  className="text-xs text-[var(--color-destructive)] hover:underline"
                >
                  Clear stored secret
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
