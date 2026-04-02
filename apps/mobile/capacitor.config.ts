import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "app.swanki.mobile",
	appName: "Swanki",
	// Points to the web app's SPA build output
	webDir: "../web/dist/client",
	server: {
		// In development, proxy to the local dev server
		// Comment this out for production builds
		url: "http://localhost:3000",
		cleartext: true,
	},
	plugins: {
		CapacitorSQLite: {
			iosDatabaseLocation: "Library/CapacitorDatabase",
			iosIsEncryption: false,
			androidIsEncryption: false,
		},
	},
};

export default config;
