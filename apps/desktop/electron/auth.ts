import { BrowserWindow, safeStorage, app } from "electron";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const TOKEN_PATH = join(app.getPath("userData"), ".auth");

/** The cloud server URL — configurable via environment variable. */
const CLOUD_SERVER_URL = process.env.SWANKI_CLOUD_URL ?? "https://swanki.app";

/**
 * Encrypt and store the session token to disk.
 * Falls back to plaintext if OS encryption is not available.
 */
export function storeToken(token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    writeFileSync(TOKEN_PATH, encrypted);
  } else {
    writeFileSync(TOKEN_PATH, token, "utf-8");
  }
}

/**
 * Retrieve the stored session token, or null if not present.
 */
export function getToken(): string | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    const data = readFileSync(TOKEN_PATH);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(data);
    }
    return data.toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Remove the stored session token.
 */
export function clearToken(): void {
  if (existsSync(TOKEN_PATH)) {
    unlinkSync(TOKEN_PATH);
  }
}

/**
 * Check whether a session token is stored.
 */
export function isSignedIn(): boolean {
  return getToken() !== null;
}

/**
 * Open a modal browser window pointing at the cloud login page.
 * Waits for the user to complete auth, extracts the session cookie,
 * stores it, and resolves with the token (or null if the window was closed).
 */
export async function openAuthWindow(
  parentWindow: BrowserWindow,
): Promise<string | null> {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      parent: parentWindow,
      modal: true,
      width: 500,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Hide the menu bar in the auth popup
    authWin.setMenuBarVisibility(false);

    authWin.loadURL(`${CLOUD_SERVER_URL}/login?desktop=true`);

    let resolved = false;

    const tryExtractToken = async () => {
      if (resolved) return;
      try {
        const cookies = await authWin.webContents.session.cookies.get({
          name: "better-auth.session_token",
        });
        if (cookies.length > 0) {
          resolved = true;
          const token = cookies[0].value;
          storeToken(token);
          authWin.close();
          resolve(token);
        }
      } catch {
        /* cookie not available yet — keep waiting */
      }
    };

    // Check for auth cookie after each navigation
    authWin.webContents.on("did-navigate", async (_e, url) => {
      // Skip login/register pages — only check post-auth pages
      if (url.includes("/login") || url.includes("/register")) return;
      await tryExtractToken();
    });

    // Also check after in-page navigations (SPA redirects)
    authWin.webContents.on("did-navigate-in-page", async () => {
      await tryExtractToken();
    });

    authWin.on("closed", () => {
      if (!resolved) {
        resolve(null);
      }
    });
  });
}

/**
 * Return the configured cloud server URL.
 */
export function getCloudServerUrl(): string {
  return CLOUD_SERVER_URL;
}
