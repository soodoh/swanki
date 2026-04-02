import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

type WindowState = {
	x?: number;
	y?: number;
	width: number;
	height: number;
	isMaximized?: boolean;
};

const statePath = join(app.getPath("userData"), "window-state.json");

export function loadWindowState(): WindowState {
	try {
		if (existsSync(statePath)) {
			return JSON.parse(readFileSync(statePath, "utf-8")) as WindowState;
		}
	} catch {
		/* use defaults */
	}
	return { width: 1200, height: 800 };
}

export function saveWindowState(state: WindowState): void {
	try {
		writeFileSync(statePath, JSON.stringify(state));
	} catch {
		/* ignore */
	}
}
