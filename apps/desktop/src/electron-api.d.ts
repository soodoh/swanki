interface ElectronAPI {
  platform: string;
  invoke(channel: string, args: unknown): Promise<unknown>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(cb: (maximized: boolean) => void): void;
  // Auth
  authSignIn(): Promise<{ signedIn: boolean }>;
  authSignOut(): Promise<{ signedIn: boolean }>;
  authStatus(): Promise<{ signedIn: boolean; cloudUrl: string }>;
  // Sync
  syncNow(): Promise<{ status: string }>;
  syncStatus(): Promise<{ status: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
