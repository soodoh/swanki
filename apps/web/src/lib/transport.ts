/* oxlint-disable eslint/class-methods-use-this -- implements AppTransport interface */
/**
 * WebTransport — web-specific implementation of AppTransport.
 * Stateless HTTP fetch wrapper, analogous to desktop's IpcTransport.
 */
import type { AppTransport } from "@swanki/core/transport";

export class WebTransport implements AppTransport {
  async query<T>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = params
      ? `${endpoint}?${new URLSearchParams(params)}`
      : endpoint;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GET ${url} failed`);
    }
    return res.json() as Promise<T>;
  }

  async mutate<T>(
    endpoint: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${method} ${endpoint} failed`);
    }
    return res.json() as Promise<T>;
  }
}
