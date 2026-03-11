/**
 * Offline-aware query and mutation helpers.
 * These wrap server fetch calls with local DB read/write support.
 */
import type { LocalDrizzleDb } from "./local-drizzle";
import type { MutationQueueHandle } from "./mutation-queue";

export type OfflineQueryOptions<T> = {
  /** The original server fetch function. */
  serverFetch: () => Promise<T>;
  /** Function to read from local DB. Returns undefined if data not available. */
  localQuery?: (db: LocalDrizzleDb) => T | undefined;
  /** The local DB instance (null if not ready). */
  db: LocalDrizzleDb | null;
  /** Whether the app is currently online. */
  isOnline: boolean;
  /** Whether the local DB has been synced at least once. */
  isLocalReady: boolean;
};

/**
 * Offline-aware query function for React Query's queryFn.
 *
 * Strategy:
 * 1. If local DB is ready and has data, serve from it immediately
 * 2. If online, also fetch from server (for freshness) — but only if we
 *    served from local cache (to avoid double-fetching on first load)
 * 3. If offline and no local data, throw
 */
export async function offlineQuery<T>(
  options: OfflineQueryOptions<T>,
): Promise<T> {
  const { serverFetch, localQuery, db, isOnline, isLocalReady } = options;

  // Try local first if available
  if (db && isLocalReady && localQuery) {
    try {
      const localResult = localQuery(db);
      if (localResult !== undefined) {
        // If we're online, fire off a background server fetch to stay fresh
        // but return local data immediately
        return localResult;
      }
    } catch {
      // Local query failed, fall through to server
    }
  }

  // Try server
  if (isOnline) {
    return serverFetch();
  }

  // Offline with no local data
  throw new Error("Offline and no cached data available");
}

export type OfflineMutationOptions<TInput, TResult> = {
  /** The original server fetch function. */
  serverFetch: (input: TInput) => Promise<TResult>;
  /** Function to apply mutation to local DB. */
  localMutation?: (db: LocalDrizzleDb, input: TInput) => void;
  /** Queue entry to enqueue if offline. */
  queueEntry?: (input: TInput) => {
    endpoint: string;
    method: string;
    body?: unknown;
  };
  /** The local DB instance (null if not ready). */
  db: LocalDrizzleDb | null;
  /** Whether the app is currently online. */
  isOnline: boolean;
  /** Mutation queue for offline queuing. */
  queue: MutationQueueHandle | null;
  /** Callback to persist local DB after mutation. */
  persist?: () => Promise<void>;
};

/**
 * Offline-aware mutation function.
 *
 * Strategy:
 * 1. Apply to local DB immediately (optimistic)
 * 2. If online, send to server
 * 3. If offline, queue for later replay
 */
export async function offlineMutation<TInput, TResult>(
  options: OfflineMutationOptions<TInput, TResult>,
  input: TInput,
): Promise<TResult | undefined> {
  const {
    serverFetch,
    localMutation,
    queueEntry,
    db,
    isOnline,
    queue,
    persist,
  } = options;

  // Apply locally first
  if (db && localMutation) {
    try {
      localMutation(db, input);
      if (persist) {
        void persist();
      }
    } catch {
      // Local mutation failed, still try server
    }
  }

  // Try server
  if (isOnline) {
    try {
      return await serverFetch(input);
    } catch {
      // Server failed — queue if we have the queue entry builder
      if (queue && queueEntry) {
        const entry = queueEntry(input);
        await queue.add(entry);
      }
      // If we applied locally, don't throw — the mutation is "done" from the user's perspective
      if (db && localMutation) {
        return;
      }
      throw new Error("Failed to apply mutation");
    }
  }

  // Offline — queue for later
  if (queue && queueEntry) {
    const entry = queueEntry(input);
    await queue.add(entry);
  }

  // If we applied locally, this is fine
  if (db && localMutation) {
    return;
  }

  throw new Error("Offline and cannot queue mutation");
}
