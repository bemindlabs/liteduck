import { useCallback, useState } from "react";
import { validate } from "@/lib/settings-validators";

export interface UseFieldValidationReturn {
  /** Validate a field and store the result. Returns `true` when the value is valid. */
  validateField: (key: string, value: string) => boolean;
  /** Programmatically clear the error for a field. */
  clearError: (key: string) => void;
  /** Retrieve the current error for a field, or `null` when clean. */
  getError: (key: string) => string | null;
  /** `true` when at least one field currently has a validation error. */
  hasErrors: boolean;
}

export function useFieldValidation(): UseFieldValidationReturn {
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const validateField = useCallback((key: string, value: string): boolean => {
    const error = validate(key, value);
    setErrors((prev) => ({ ...prev, [key]: error }));
    return error === null;
  }, []);

  const clearError = useCallback((key: string): void => {
    setErrors((prev) => ({ ...prev, [key]: null }));
  }, []);

  const getError = useCallback((key: string): string | null => errors[key] ?? null, [errors]);

  const hasErrors = Object.values(errors).some((e) => e !== null);

  return { validateField, clearError, getError, hasErrors };
}
