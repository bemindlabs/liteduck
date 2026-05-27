import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  biometricStatus,
  biometricAuthenticate,
  biometricSetGate,
  type BiometricStatus,
} from "@/lib/biometric";
import { getSetting, saveSetting } from "@/lib/settings";
import { createLogger } from "@/lib/logger";
import { useIdleTimer } from "@/hooks/useIdleTimer";

const logger = createLogger("BiometricContext");

interface BiometricContextValue {
  /** Hardware availability and type (e.g. "Touch ID"). */
  status: BiometricStatus | null;
  /** Whether the user has opted-in to biometric keychain protection. */
  enabled: boolean;
  /** Whether the keychain has been unlocked in this session. */
  unlocked: boolean;
  /** Toggle the biometric lock setting on/off. */
  setEnabled: (on: boolean) => Promise<void>;
  /** Prompt for biometric auth. Resolves true on success. */
  unlock: () => Promise<boolean>;
  /** Re-lock (e.g. on idle timeout). */
  lock: () => void;
  /** Re-read the idle timeout from settings (call after saving the setting). */
  refreshIdleTimeout: () => Promise<void>;
}

const BiometricContext = createContext<BiometricContextValue>({
  status: null,
  enabled: false,
  unlocked: true,
  setEnabled: async () => {
    /* noop */
  },
  unlock: () => Promise.resolve(true),
  lock: () => {
    /* noop */
  },
  refreshIdleTimeout: () => Promise.resolve(),
});

const SETTING_KEY = "biometric_lock_enabled";

export function BiometricProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [enabled, setEnabledState] = useState(false);
  const [unlocked, setUnlocked] = useState(true);

  // Load hardware status + user preference on mount.
  useEffect(() => {
    void biometricStatus()
      .then(setStatus)
      .catch(() => {
        /* noop */
      });
    void getSetting(SETTING_KEY)
      .then((val) => {
        if (val === "true") {
          setEnabledState(true);
          setUnlocked(false); // locked until authenticated
        }
      })
      .catch((err: unknown) => {
        logger.warn("Failed to load biometric setting", err);
      });
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    if (on) {
      // Verify biometric works before enabling.
      await biometricAuthenticate("Verify biometric to enable keychain lock");
    }
    await saveSetting(SETTING_KEY, on ? "true" : "false");
    setEnabledState(on);
    setUnlocked(!on ? true : true); // after toggling on we just verified, so unlocked
  }, []);

  const unlock = useCallback(async () => {
    if (!enabled) {
      setUnlocked(true);
      return true;
    }
    try {
      await biometricAuthenticate("Unlock keychain secrets");
      setUnlocked(true);
      return true;
    } catch {
      return false;
    }
  }, [enabled]);

  const lock = useCallback(() => {
    if (enabled) setUnlocked(false);
  }, [enabled]);

  // Auto-lock after idle timeout (default 15 minutes).
  const [idleTimeoutMs, setIdleTimeoutMs] = useState(15 * 60 * 1000);

  // Re-read the setting from storage and update the timer.
  // Called directly by BiometricSection after the user changes the timeout.
  const refreshIdleTimeout = useCallback(async () => {
    try {
      const val = await getSetting("biometric_idle_timeout_minutes");
      const mins = val ? parseInt(val, 10) : NaN;
      if (!isNaN(mins) && mins > 0) setIdleTimeoutMs(mins * 60 * 1000);
    } catch {
      /* retain default */
    }
  }, []);

  // Re-read on mount and whenever biometric is toggled so the latest
  // saved timeout is always active (handles app restarts and re-enable).
  useEffect(() => {
    void getSetting("biometric_idle_timeout_minutes")
      .then((val) => {
        const mins = val ? parseInt(val, 10) : NaN;
        if (!isNaN(mins) && mins > 0) setIdleTimeoutMs(mins * 60 * 1000);
      })
      .catch(() => undefined);
  }, [enabled]);

  useIdleTimer(lock, idleTimeoutMs, enabled && unlocked);

  // Sync gate state to the backend whenever enabled/unlocked changes.
  useEffect(() => {
    void biometricSetGate(enabled, unlocked).catch(() => {
      /* noop — backend may not be ready yet */
    });
  }, [enabled, unlocked]);

  return (
    <BiometricContext.Provider
      value={{ status, enabled, unlocked, setEnabled, unlock, lock, refreshIdleTimeout }}
    >
      {children}
    </BiometricContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBiometric() {
  return useContext(BiometricContext);
}
