import { createAuthClient } from "better-auth/client";
import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { getCloudServerUrl } from "./auth";

const baseURL = getCloudServerUrl();

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    electronClient({
      signInURL: `${baseURL}/login`,
      protocol: { scheme: "swanki" },
      storage: storage(),
    }),
  ],
});

/**
 * One-shot promise resolver for auth completion.
 * The deep link handler in main.ts calls `resolveAuthWait(true)` when
 * authentication completes. The `auth:sign-in` IPC handler awaits
 * `waitForAuth()` to know when the user has finished signing in.
 */
let authResolve: ((authenticated: boolean) => void) | null = null;
let authTimeout: ReturnType<typeof setTimeout> | null = null;

const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function waitForAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    authResolve = resolve;
    authTimeout = setTimeout(() => {
      authResolve = null;
      resolve(false);
    }, AUTH_TIMEOUT_MS);
  });
}

export function resolveAuthWait(authenticated: boolean): void {
  if (authTimeout) {
    clearTimeout(authTimeout);
    authTimeout = null;
  }
  authResolve?.(authenticated);
  authResolve = null;
}
