import type { AppTransport } from "@swanki/core/transport";

export class IpcTransport implements AppTransport {
	async query<T>(
		endpoint: string,
		params?: Record<string, string>,
	): Promise<T> {
		return window.electronAPI.invoke("db:query", {
			endpoint,
			params,
		}) as Promise<T>;
	}

	async mutate<T>(
		endpoint: string,
		method: "POST" | "PUT" | "DELETE" | "PATCH",
		body?: unknown,
	): Promise<T> {
		return window.electronAPI.invoke("db:mutate", {
			endpoint,
			method,
			body,
		}) as Promise<T>;
	}
}
