/**
 * IndexedDB-backed FIFO mutation queue.
 * Stores mutations that need to be replayed to the server when connectivity returns.
 */

const IDB_DB_NAME = "swanki-mutations";
const IDB_STORE_NAME = "queue";
const IDB_VERSION = 1;

export type QueueEntry = {
  id: string;
  timestamp: number;
  endpoint: string;
  method: string;
  body: unknown;
};

async function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export type MutationQueueHandle = {
  /** Add a mutation to the queue. */
  add: (entry: Omit<QueueEntry, "id" | "timestamp">) => Promise<string>;
  /** Get all queued mutations in FIFO order. */
  getAll: () => Promise<QueueEntry[]>;
  /** Remove a processed mutation. */
  remove: (id: string) => Promise<void>;
  /** Get the count of queued mutations. */
  count: () => Promise<number>;
  /** Clear all queued mutations. */
  clear: () => Promise<void>;
};

export function createMutationQueue(): MutationQueueHandle {
  const add = async (
    entry: Omit<QueueEntry, "id" | "timestamp">,
  ): Promise<string> => {
    const idb = await openIdb();
    const id = crypto.randomUUID();
    const full: QueueEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE_NAME, "readwrite");
      const store = tx.objectStore(IDB_STORE_NAME);
      const request = store.add(full);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  };

  const getAll = async (): Promise<QueueEntry[]> => {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE_NAME, "readonly");
      const store = tx.objectStore(IDB_STORE_NAME);
      const index = store.index("timestamp");
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result as QueueEntry[]);
      request.onerror = () => reject(request.error);
    });
  };

  const remove = async (id: string): Promise<void> => {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE_NAME, "readwrite");
      const store = tx.objectStore(IDB_STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  const count = async (): Promise<number> => {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE_NAME, "readonly");
      const store = tx.objectStore(IDB_STORE_NAME);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const clear = async (): Promise<void> => {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE_NAME, "readwrite");
      const store = tx.objectStore(IDB_STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  return { add, getAll, remove, count, clear };
}
