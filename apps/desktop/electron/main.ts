import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, protocol } from "electron";
import { authClient, resolveAuthWait } from "./auth-client";
import { db, mediaDir, rawSqlite } from "./db";
import { registerIpcHandlers } from "./ipc-handlers";
import { getOrCreateLocalUser } from "./local-user";
import { initAutoUpdater } from "./updater";
import { loadWindowState, saveWindowState } from "./window-state";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

// Register custom protocol schemes as privileged before app ready.
// Both swanki-media:// (media streaming) and swanki:// (auth deep links)
// must be registered in a single call.
protocol.registerSchemesAsPrivileged([
	{
		scheme: "swanki-media",
		privileges: {
			secure: true,
			standard: true,
			supportFetchAPI: true,
			stream: true,
		},
	},
	{
		scheme: "swanki",
		privileges: {
			secure: true,
		},
	},
]);

// Setup auth IPC bridges and CSP (skip scheme registration — done above)
authClient.setupMain({
	scheme: false,
	getWindow: () => mainWindow,
});

// Register as default handler for swanki:// deep links
if ((process as NodeJS.Process & { defaultApp?: boolean }).defaultApp) {
	app.setAsDefaultProtocolClient("swanki", process.execPath, [
		join(process.argv[1] ?? ""),
	]);
} else {
	app.setAsDefaultProtocolClient("swanki");
}

async function handleDeepLinkUrl(url: string): Promise<void> {
	if (!url.startsWith("swanki://")) return;
	try {
		const parsed = new URL(url);
		if (parsed.hash.startsWith("#token=")) {
			const result = await authClient.authenticate({
				token: parsed.hash.substring(7),
			});
			resolveAuthWait(!result.error);
		}
	} catch {
		resolveAuthWait(false);
	}
}

// Handle deep link auth callbacks on macOS
app.on("open-url", async (_event, url) => {
	await handleDeepLinkUrl(url);
});

// Handle deep links on Windows/Linux via second-instance
app.on("second-instance", async (_event, commandLine) => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	}
	const url = commandLine.pop();
	if (typeof url === "string") {
		await handleDeepLinkUrl(url);
	}
});

// Allow audio autoplay without user gesture (Electron apps have no MEI history)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow: BrowserWindow | null = null;

// Get or create local user
const localUser = getOrCreateLocalUser(db);

app.whenReady().then(() => {
	// Initialise auto-updater (no-op in dev)
	initAutoUpdater();

	const MIME_TYPES: Record<string, string> = {
		mp3: "audio/mpeg",
		ogg: "audio/ogg",
		wav: "audio/wav",
		mp4: "video/mp4",
		webm: "video/webm",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		svg: "image/svg+xml",
	};

	// Serve local media files via a custom protocol with correct MIME types and
	// Range support (required for audio/video seeking).
	// net.fetch("file://") doesn't set Content-Type, causing MEDIA_ERR_SRC_NOT_SUPPORTED
	// for audio elements, so we read the file directly and set headers ourselves.
	protocol.handle("swanki-media", async (request) => {
		const filename = decodeURIComponent(
			request.url.replace("swanki-media://media/", ""),
		);
		const filePath = join(mediaDir, filename);
		const ext = filename.split(".").pop()?.toLowerCase() ?? "";
		const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

		let fileBytes: Buffer;
		try {
			fileBytes = await readFile(filePath);
		} catch {
			return new Response(null, { status: 404 });
		}

		const rangeHeader = request.headers.get("Range");
		if (rangeHeader) {
			const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
			if (match) {
				const start = parseInt(match[1], 10);
				const end = match[2] ? parseInt(match[2], 10) : fileBytes.length - 1;
				const chunk = fileBytes.slice(start, end + 1);
				return new Response(chunk, {
					status: 206,
					headers: {
						"Content-Type": contentType,
						"Content-Range": `bytes ${start}-${end}/${fileBytes.length}`,
						"Accept-Ranges": "bytes",
					},
				});
			}
		}

		return new Response(fileBytes, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Accept-Ranges": "bytes",
			},
		});
	});

	// Restore window state
	const windowState = loadWindowState();

	mainWindow = new BrowserWindow({
		...windowState,
		minWidth: 800,
		minHeight: 600,
		frame: false,
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 16, y: 16 },
		webPreferences: {
			preload: join(__dirname, "preload.cjs"),
		},
	});

	if (windowState.isMaximized) {
		mainWindow.maximize();
	}

	// Register IPC handlers
	registerIpcHandlers(db, rawSqlite, localUser.id, mediaDir, mainWindow);

	// Save window state on close
	mainWindow.on("close", () => {
		if (mainWindow) {
			const bounds = mainWindow.getBounds();
			saveWindowState({
				...bounds,
				isMaximized: mainWindow.isMaximized(),
			});
		}
	});

	// Emit maximized changes to renderer
	mainWindow.on("maximize", () => {
		mainWindow?.webContents.send("window:maximized-changed", true);
	});
	mainWindow.on("unmaximize", () => {
		mainWindow?.webContents.send("window:maximized-changed", false);
	});

	// Open DevTools in development (not during automated tests)
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL && !process.env.PLAYWRIGHT_TEST) {
		mainWindow.webContents.openDevTools();
	}

	// Load renderer
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(
			join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
		);
	}
});

app.on("window-all-closed", () => {
	app.quit();
});
