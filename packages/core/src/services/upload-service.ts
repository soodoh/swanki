import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function ensureDir(dir: string): void {
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
  if (!existsSync(dir)) {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
    mkdirSync(dir, { recursive: true });
  }
}

function userDir(uploadDir: string, userId: string): string {
  // oxlint-disable-next-line typescript-eslint(no-unsafe-return), typescript-eslint(no-unsafe-call) -- node:path join is untyped
  return join(uploadDir, userId);
}

export type UploadResult = {
  fileId: string;
  filePath: string;
  format: string;
};

export async function saveUpload(
  uploadDir: string,
  userId: string,
  file: File,
): Promise<UploadResult> {
  const dir = userDir(uploadDir, userId);
  ensureDir(dir);

  const fileId = crypto.randomUUID();
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment), typescript-eslint(no-unsafe-call) -- node:path join is untyped
  const filePath: string = join(dir, `${fileId}${ext}`);

  const buffer = await file.arrayBuffer();
  // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped in this project
  writeFileSync(filePath, Buffer.from(buffer));

  // Clean up expired uploads for this user in the background
  cleanupExpired(uploadDir, userId);

  return { fileId, filePath, format: ext.slice(1) };
}

export function getUploadPath(
  uploadDir: string,
  userId: string,
  fileId: string,
): string | undefined {
  const dir = userDir(uploadDir, userId);
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

export function deleteUpload(
  uploadDir: string,
  userId: string,
  fileId: string,
): void {
  const filePath = getUploadPath(uploadDir, userId, fileId);
  if (filePath) {
    try {
      // oxlint-disable-next-line typescript-eslint(no-unsafe-call) -- node:fs is untyped
      unlinkSync(filePath);
    } catch {
      // File already deleted, ignore
    }
  }
}

export function cleanupExpired(uploadDir: string, userId: string): void {
  const dir = userDir(uploadDir, userId);
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
