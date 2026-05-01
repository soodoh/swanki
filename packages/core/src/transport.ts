import { createContext, useContext } from "react";

export interface AppTransport {
	query<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
	mutate<T>(
		endpoint: string,
		method: "POST" | "PUT" | "PATCH" | "DELETE",
		body?: unknown,
	): Promise<T>;
}

const TransportContext = createContext<AppTransport | undefined>(undefined);

export function useTransport(): AppTransport {
	const transport = useContext(TransportContext);
	if (!transport) {
		throw new Error("useTransport must be used within TransportProvider");
	}
	return transport;
}

export const TransportProvider = TransportContext.Provider;
