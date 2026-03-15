import { createContext, useContext } from "react";

export interface AppTransport {
  query<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
  mutate<T>(
    endpoint: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<T>;
}

const TransportContext = createContext<AppTransport>(null!);

export function useTransport(): AppTransport {
  return useContext(TransportContext);
}

export const TransportProvider = TransportContext.Provider;
