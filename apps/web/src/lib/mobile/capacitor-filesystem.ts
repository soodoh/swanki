import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import type { AppFileSystem } from "@swanki/core/filesystem";

/**
 * Capacitor Filesystem implementation of AppFileSystem.
 * Used by the mobile app for media and upload file operations.
 *
 * All paths are relative to the app's data directory.
 */
export const capacitorFs: AppFileSystem = {
  join(...paths: string[]): string {
    return paths.join("/");
  },

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path, directory: Directory.Data });
      return true;
    } catch {
      return false;
    }
  },

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await Filesystem.mkdir({
      path,
      directory: Directory.Data,
      recursive: options?.recursive ?? false,
    });
  },

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    // Convert Uint8Array to base64 for Capacitor
    const binary = Array.from(data)
      .map((b) => String.fromCharCode(b))
      .join("");
    const base64 = btoa(binary);

    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Data,
    });
  },

  async readDir(path: string): Promise<string[]> {
    const result = await Filesystem.readdir({
      path,
      directory: Directory.Data,
    });
    return result.files.map((f) => f.name);
  },

  async stat(path: string): Promise<{ mtimeMs: number }> {
    const result = await Filesystem.stat({
      path,
      directory: Directory.Data,
    });
    return { mtimeMs: result.mtime ?? 0 };
  },

  async unlink(path: string): Promise<void> {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Data,
    });
  },

  async rmdir(path: string): Promise<void> {
    await Filesystem.rmdir({
      path,
      directory: Directory.Data,
    });
  },
};
