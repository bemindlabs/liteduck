import { Palette } from "lucide-react";
import { SettingField, type FieldDef } from "../components/SettingField";

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
    helpText: "Base font size in pixels for terminals and editors.",
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
    helpText: "Number of scrollback lines retained per terminal session.",
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
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <SettingField def={field} value={values[field.key] ?? ""} onChange={onChange} />
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
        ))}
      </div>
    </section>
  );
}
