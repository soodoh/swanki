/**
 * OfflineProvider React context.
 * Wraps authenticated routes to provide offline database access and sync management.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LocalDrizzleDb } from "./local-drizzle";
import { openLocalDb } from "./local-db";
import type { LocalDbHandle } from "./local-db";
import { useConnectivity } from "./connectivity";
import { syncPull, syncPush } from "./sync-engine";
import { createMutationQueue } from "./mutation-queue";
import type { MutationQueueHandle } from "./mutation-queue";

export type SyncStatus = "idle" | "syncing" | "error";

type OfflineContextValue = {
  /** The Drizzle-wrapped local database instance (null if not initialized yet). */
  db: LocalDrizzleDb | null;
  /** Whether the server is reachable. */
  isOnline: boolean;
  /** Whether the local DB has been synced at least once (data is available). */
  isLocalReady: boolean;
  /** Current sync status. */
  syncStatus: SyncStatus;
  /** Number of queued mutations waiting to be synced. */
  pendingMutations: number;
  /** Mutation queue for offline queuing. */
  queue: MutationQueueHandle | null;
  /** Persist local DB to IndexedDB. */
  persist: () => Promise<void>;
  /** Trigger a manual sync. */
  syncNow: () => Promise<void>;
};

// oxlint-disable-next-line no-empty-function -- default context value
const noop = async () => {};

const OfflineContext = createContext<OfflineContextValue>({
  db: null,
  isOnline: true,
  isLocalReady: false,
  syncStatus: "idle",
  pendingMutations: 0,
  queue: null,
  persist: noop,
  syncNow: noop,
});

export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext);
}

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type OfflineProviderProps = {
  userId: string;
  children: ReactNode;
};

export function OfflineProvider({
  userId,
  children,
}: OfflineProviderProps): React.ReactElement {
  const queryClient = useQueryClient();
  const { isOnline, checkNow } = useConnectivity();
  const [db, setDb] = useState<LocalDrizzleDb | null>(null);
  const [isLocalReady, setIsLocalReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [pendingMutations, setPendingMutations] = useState(0);
  const handleRef = useRef<LocalDbHandle | null>(null);
  const queueRef = useRef<MutationQueueHandle | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);

  // Initialize local DB and mutation queue
  useEffect(() => {
    // Only run on client
    if (globalThis.window === undefined) {
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        const handle = await openLocalDb(userId);
        if (cancelled) {
          handle.close();
          return;
        }
        handleRef.current = handle;
        setDb(handle.drizzleDb);
        setIsLocalReady(handle.hasSynced());

        const queue = createMutationQueue();
        queueRef.current = queue;
        const count = await queue.count();
        setPendingMutations(count);
      } catch {
        // Local DB init failed — app continues without offline support
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (handleRef.current) {
        handleRef.current.close();
        handleRef.current = null;
      }
      setDb(null);
      setIsLocalReady(false);
    };
  }, [userId]);

  const doSync = useCallback(async () => {
    if (isSyncingRef.current || !handleRef.current) {
      return;
    }
    isSyncingRef.current = true;
    setSyncStatus("syncing");

    try {
      // Push queued mutations first
      if (queueRef.current) {
        await syncPush(queueRef.current);
        const count = await queueRef.current.count();
        setPendingMutations(count);
      }

      // Pull latest data
      await syncPull(handleRef.current);
      setIsLocalReady(true);

      // Invalidate all queries so React Query refetches from local
      void queryClient.invalidateQueries();

      setSyncStatus("idle");
    } catch {
      setSyncStatus("error");
    } finally {
      isSyncingRef.current = false;
    }
  }, [queryClient]);

  // Sync on mount and periodically when online
  useEffect(() => {
    if (!isOnline || !handleRef.current) {
      return;
    }

    // Initial sync
    void doSync();

    // Periodic sync
    syncIntervalRef.current = setInterval(() => {
      if (isOnline) {
        void doSync();
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isOnline, doSync]);

  // Sync on visibility change
  useEffect(() => {
    if (!isOnline || !handleRef.current) {
      return;
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        const online = await checkNow();
        if (online) {
          void doSync();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOnline, doSync, checkNow]);

  const persist = useCallback(async () => {
    if (handleRef.current) {
      await handleRef.current.persist();
    }
  }, []);

  const syncNow = useCallback(async () => {
    const online = await checkNow();
    if (online) {
      await doSync();
    }
  }, [checkNow, doSync]);

  const value: OfflineContextValue = useMemo(
    () => ({
      db,
      isOnline,
      isLocalReady,
      syncStatus,
      pendingMutations,
      queue: queueRef.current,
      persist,
      syncNow,
    }),
    [
      db,
      isOnline,
      isLocalReady,
      syncStatus,
      pendingMutations,
      persist,
      syncNow,
    ],
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}
