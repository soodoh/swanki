import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";

// oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-member-access) -- node:path and process are untyped in this project
const UPLOAD_DIR: string = join(process.cwd(), "data", "uploads");
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function ensureDir(dir: string): void {
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
  if (!existsSync(dir)) {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    mkdirSync(dir, { recursive: true });
  }
}

function userDir(userId: string): string {
  // oxlint-disable-next-line typescript-eslint(no-unsafe-return), typescript-eslint(no-unsafe-call) -- node:path join is untyped
  return join(UPLOAD_DIR, userId);
}

export type UploadResult = {
  fileId: string;
  filePath: string;
  format: string;
};

export async function saveUpload(
  userId: string,
  file: File,
): Promise<UploadResult> {
  const dir = userDir(userId);
  ensureDir(dir);

  const fileId = crypto.randomUUID();
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path join is untyped
  const filePath: string = join(dir, `${fileId}${ext}`);

  const buffer = await file.arrayBuffer();
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-member-access) -- Bun global is untyped in this project
  await Bun.write(filePath, buffer);

  // Clean up expired uploads for this user in the background
  cleanupExpired(userId);

  return { fileId, filePath, format: ext.slice(1) };
}

export function getUploadPath(
  userId: string,
  fileId: string,
): string | undefined {
  const dir = userDir(userId);
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
  if (!existsSync(dir)) {
    return undefined;
  }

  // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- node:fs is untyped
  const entries: string[] = readdirSync(dir);
  const match = entries.find((name: string) => name.startsWith(fileId));
  if (!match) {
    return undefined;
  }

  // oxlint-disable-next-line typescript-eslint(no-unsafe-return), typescript-eslint(no-unsafe-call) -- node:path join is untyped
  return join(dir, match);
}

export function deleteUpload(userId: string, fileId: string): void {
  const filePath = getUploadPath(userId, fileId);
  if (filePath) {
    try {
      // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped
      unlinkSync(filePath);
    } catch {
      // File already deleted, ignore
    }
  }
}

export function cleanupExpired(userId: string): void {
  const dir = userDir(userId);
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped
  if (!existsSync(dir)) {
    return;
  }

  const now = Date.now();
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- node:fs is untyped
  const entries: string[] = readdirSync(dir);

  for (const name of entries) {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path join is untyped
    const filePath: string = join(dir, name);
    try {
      // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- node:fs is untyped
      const stat: { mtimeMs: number } = statSync(filePath);
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped
        unlinkSync(filePath);
      }
    } catch {
      // Skip files that can't be stat'd
    }
  }

  // Remove empty user directory
  try {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call), typescript-eslint(no-unsafe-assignment) -- node:fs is untyped
    const remaining: string[] = readdirSync(dir);
    if (remaining.length === 0) {
      // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped
      rmdirSync(dir);
    }
  } catch {
    // Ignore
  }
}
