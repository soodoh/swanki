type DesktopCloudUser = { name: string; email: string; image?: string };

interface ElectronAPI {
	platform: string;
	invoke(channel: string, args: unknown): Promise<unknown>;
	minimize(): Promise<void>;
	maximize(): Promise<void>;
	close(): Promise<void>;
	isMaximized(): Promise<boolean>;
	onMaximizedChange(cb: (maximized: boolean) => void): void;
	// Auth
	authSignIn(): Promise<{
		signedIn: boolean;
		hasLocalData?: boolean;
		user?: DesktopCloudUser;
	}>;
	authSignOut(): Promise<{ signedIn: boolean }>;
	authStatus(): Promise<{
		signedIn: boolean;
		cloudUrl: string;
		user?: DesktopCloudUser;
	}>;
	authCompleteSignIn(data: {
		strategy: "merge" | "replace";
	}): Promise<{ ok: boolean; user?: DesktopCloudUser }>;
	// Sync
	syncNow(): Promise<{ status: string }>;
	syncStatus(): Promise<{ status: string }>;
	// Settings
	settingsGet(): Promise<{
		cloudServerUrl: string;
		signedIn: boolean;
		syncStatus: string;
		lastSyncTime: number | null;
	}>;
	settingsUpdate(data: { cloudServerUrl: string }): Promise<{ ok: boolean }>;
}

declare global {
	interface Window {
		electronAPI: ElectronAPI;
	}
}

export {};
