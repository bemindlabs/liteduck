export type Validator = (value: string) => string | null;

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

export const isRequired: Validator = (value) => (value.trim() ? null : "This field is required.");

export const isValidUrl: Validator = (value) => {
  if (!value.trim()) return null; // optional field
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Must be a valid http:// or https:// URL.";
    }
    return null;
  } catch {
    return "Must be a valid http:// or https:// URL.";
  }
};

export const isPositiveNumber: Validator = (value) => {
  if (!value.trim()) return null;
  const n = Number(value);
  return isNaN(n) || n <= 0 ? "Please enter a positive number." : null;
};

export const isPort: Validator = (value) => {
  if (!value.trim()) return null;
  const n = Number(value);
  return isNaN(n) || !Number.isInteger(n) || n < 1 || n > 65535 ? "Port must be 1–65535." : null;
};

// ---------------------------------------------------------------------------
// Composite / range validators (from design-settings-redesign.md §9)
// ---------------------------------------------------------------------------

/** appearance.font_size — 10 ≤ value ≤ 24 */
export const isFontSize: Validator = (value) => {
  if (!value.trim()) return null;
  const n = Number(value);
  return isNaN(n) || n < 10 || n > 24 ? "Font size must be between 10 and 24." : null;
};

// ---------------------------------------------------------------------------
// Registry  —  maps setting key → validator
// ---------------------------------------------------------------------------

export const VALIDATORS: Partial<Record<string, Validator>> = {
  // Appearance section
  "appearance.font_size": isFontSize,

  // Terminal section
  "terminal.shell": isRequired,

  // Network section
  "network.proxy_url": isValidUrl,

  // Integrations section
  "integrations.jira.base_url": isValidUrl,

  // Legacy / flat keys kept for backward-compat with existing settings sections
  jira_base_url: isValidUrl,
};

/**
 * Validate a single field value by its registry key.
 * Returns an error string, or `null` when the value is valid
 * (or the key has no registered validator).
 */
export function validate(key: string, value: string): string | null {
  const validator = VALIDATORS[key];
  return validator ? validator(value) : null;
}
