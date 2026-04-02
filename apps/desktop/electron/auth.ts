import { getCloudServerUrlFromConfig } from "./sync";

/**
 * Return the configured cloud server URL.
 * Priority: sync-state.json config > SWANKI_CLOUD_URL env var > localhost default.
 */
export function getCloudServerUrl(): string {
	const fromConfig = getCloudServerUrlFromConfig();
	if (fromConfig) return fromConfig;
	return process.env.SWANKI_CLOUD_URL ?? "http://localhost:3000";
}
