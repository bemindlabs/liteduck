import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingSecretProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id: string;
}

export function SettingSecret({ value, onChange, placeholder, id }: SettingSecretProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative flex items-center">
      <input
        id={id}
        type={revealed ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
        className={cn(
          "w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)]",
          "px-3 py-2 pr-10 text-sm text-[var(--color-foreground)]",
          "placeholder:text-[var(--color-muted-foreground)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] focus:ring-offset-1",
        )}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="absolute right-2.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
        aria-label={revealed ? "Hide value" : "Reveal value"}
        tabIndex={-1}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
