import { app } from "electron";

/**
 * Initialise the auto-updater.
 * Only active in production (packaged) builds — no-op during development.
 * Uses update-electron-app which checks GitHub Releases for new versions.
 */
export function initAutoUpdater(): void {
	if (!app.isPackaged) return;

	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const updateElectronApp = require("update-electron-app");
		updateElectronApp({
			updateInterval: "4 hours",
			logger: console,
		});
	} catch (e) {
		console.error("Auto-updater init failed:", e);
	}
}
