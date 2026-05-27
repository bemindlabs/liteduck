import { cn } from "@/lib/utils";
import { Select } from "./select";

// ---------------------------------------------------------------------------
// Field — text input with label and optional help text
// ---------------------------------------------------------------------------

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helpText?: string;
}

export function Field({ label, id, helpText, className, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          "rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-foreground)]",
          "placeholder:text-[var(--color-muted-foreground)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]",
          className,
        )}
        {...props}
      />
      {helpText && <p className="text-xs text-[var(--color-muted-foreground)]">{helpText}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextAreaField — textarea with label, optional help text, optional rows
// ---------------------------------------------------------------------------

export interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helpText?: string;
}

export function TextAreaField({
  label,
  id,
  helpText,
  rows = 3,
  className,
  ...props
}: TextAreaFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className={cn(
          "rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-1.5 text-sm text-[var(--color-foreground)]",
          "placeholder:text-[var(--color-muted-foreground)] resize-none",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]",
          className,
        )}
        {...props}
      />
      {helpText && <p className="text-xs text-[var(--color-muted-foreground)]">{helpText}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectField — select dropdown with label, options, optional help text
// ---------------------------------------------------------------------------

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  helpText?: string;
}

export function SelectField({
  label,
  id,
  options,
  helpText,
  className,
  size: _htmlSize,
  ...props
}: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <Select id={id} className={className} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {helpText && <p className="text-xs text-[var(--color-muted-foreground)]">{helpText}</p>}
    </div>
  );
}
