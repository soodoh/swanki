import type { AppFileSystem } from "../filesystem";

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

async function ensureDir(fs: AppFileSystem, dir: string): Promise<void> {
	if (!(await fs.exists(dir))) {
		await fs.mkdir(dir, { recursive: true });
	}
}

function userDir(fs: AppFileSystem, uploadDir: string, userId: string): string {
	return fs.join(uploadDir, userId);
}

export type UploadResult = {
	fileId: string;
	filePath: string;
	format: string;
};

export async function saveUpload(
	fs: AppFileSystem,
	uploadDir: string,
	userId: string,
	file: File,
): Promise<UploadResult> {
	const dir = userDir(fs, uploadDir, userId);
	await ensureDir(fs, dir);

	const fileId = crypto.randomUUID();
	const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
	const filePath = fs.join(dir, `${fileId}${ext}`);

	const buffer = await file.arrayBuffer();
	await fs.writeFile(filePath, new Uint8Array(buffer));

	// Clean up expired uploads for this user in the background
	void cleanupExpired(fs, uploadDir, userId);

	return { fileId, filePath, format: ext.slice(1) };
}

export async function getUploadPath(
	fs: AppFileSystem,
	uploadDir: string,
	userId: string,
	fileId: string,
): Promise<string | undefined> {
	const dir = userDir(fs, uploadDir, userId);
	if (!(await fs.exists(dir))) {
		return undefined;
	}

	const entries = await fs.readDir(dir);
	const match = entries.find((name: string) => name.startsWith(fileId));
	if (!match) {
		return undefined;
	}

	return fs.join(dir, match);
}

export async function deleteUpload(
	fs: AppFileSystem,
	uploadDir: string,
	userId: string,
	fileId: string,
): Promise<void> {
	const filePath = await getUploadPath(fs, uploadDir, userId, fileId);
	if (filePath) {
		try {
			await fs.unlink(filePath);
		} catch {
			// File already deleted, ignore
		}
	}
}

export async function cleanupExpired(
	fs: AppFileSystem,
	uploadDir: string,
	userId: string,
): Promise<void> {
	const dir = userDir(fs, uploadDir, userId);
	if (!(await fs.exists(dir))) {
		return;
	}

	const now = Date.now();
	const entries = await fs.readDir(dir);

	for (const name of entries) {
		const filePath = fs.join(dir, name);
		try {
			const stat = await fs.stat(filePath);
			if (now - stat.mtimeMs > MAX_AGE_MS) {
				await fs.unlink(filePath);
			}
		} catch {
			// Skip files that can't be stat'd
		}
	}

	// Remove empty user directory
	try {
		const remaining = await fs.readDir(dir);
		if (remaining.length === 0) {
			await fs.rmdir(dir);
		}
	} catch {
		// Ignore
	}
}
