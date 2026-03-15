/**
 * WebTransport — web-specific implementation of AppTransport.
 * Wraps offlineQuery/offlineMutation with local-router resolution.
 */
import type { AppTransport } from "@swanki/core/transport";
import type { OfflineContextValue } from "./offline/offline-provider";
import { offlineQuery, offlineMutation } from "./offline/offline-fetch";
import {
  resolveLocalQuery,
  resolveLocalMutation,
} from "./offline/local-router";

export class WebTransport implements AppTransport {
  constructor(private offline: OfflineContextValue) {}

  async query<T>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = params
      ? `${endpoint}?${new URLSearchParams(params)}`
      : endpoint;
    const localQuery = resolveLocalQuery(endpoint, params);

    return offlineQuery({
      serverFetch: async () => {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`GET ${url} failed`);
        }
        return res.json() as Promise<T>;
      },
      localQuery: localQuery as
        | ((db: Parameters<typeof offlineQuery>[0]["db"] & object) => T)
        | undefined,
      db: this.offline.db,
      isOnline: this.offline.isOnline,
      isLocalReady: this.offline.isLocalReady,
    }) as Promise<T>;
  }

  async mutate<T>(
    endpoint: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<T> {
    const localMutation = resolveLocalMutation(endpoint, method, body);

    return offlineMutation(
      {
        serverFetch: async (input) => {
          const res = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          if (!res.ok) {
            throw new Error(`${method} ${endpoint} failed`);
          }
          return res.json() as Promise<T>;
        },
        localMutation,
        queueEntry: () => ({ endpoint, method, body }),
        db: this.offline.db,
        isOnline: this.offline.isOnline,
        queue: this.offline.queue,
        persist: this.offline.persist,
      },
      body,
    ) as Promise<T>;
  }
}
