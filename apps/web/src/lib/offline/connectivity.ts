/**
 * Connectivity detection hook.
 * Combines navigator.onLine with a periodic server reachability check.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const PING_INTERVAL_MS = 30_000; // Check every 30 seconds
const PING_TIMEOUT_MS = 5000;

async function checkServerReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const res = await fetch("/api/sync/ping", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export type ConnectivityState = {
  /** Whether we believe the app has network connectivity to the server. */
  isOnline: boolean;
  /** Force an immediate connectivity check. */
  checkNow: () => Promise<boolean>;
};

export function useConnectivity(): ConnectivityState {
  const [isOnline, setIsOnline] = useState(
    navigator === undefined ? true : navigator.onLine,
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNow = useCallback(async (): Promise<boolean> => {
    if (navigator !== undefined && !navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    const reachable = await checkServerReachable();
    setIsOnline(reachable);
    return reachable;
  }, []);

  useEffect(() => {
    // Skip on server
    if (globalThis.window === undefined) {
      return;
    }

    const handleOnline = () => {
      void checkNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    globalThis.addEventListener("online", handleOnline);
    globalThis.addEventListener("offline", handleOffline);

    // Periodic check
    intervalRef.current = setInterval(() => {
      void checkNow();
    }, PING_INTERVAL_MS);

    // Initial check
    void checkNow();

    return () => {
      globalThis.removeEventListener("online", handleOnline);
      globalThis.removeEventListener("offline", handleOffline);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkNow]);

  return { isOnline, checkNow };
}
