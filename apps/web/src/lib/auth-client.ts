import { createAuthClient } from "better-auth/react";
import { electronProxyClient } from "@better-auth/electron/proxy";

const envVars = (import.meta as { env: Record<string, string | undefined> })
  .env;

export const authClient = createAuthClient({
  baseURL: envVars.VITE_BETTER_AUTH_URL ?? "http://localhost:3000",
  plugins: [
    electronProxyClient({
      protocol: { scheme: "swanki" },
    }),
  ],
});
