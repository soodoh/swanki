/**
 * Media file caching using the Cache API.
 * Eagerly downloads all user media files for offline access.
 */
import type { LocalDrizzleDb } from "./local-drizzle";
import { media } from "../../db/schema";

const CACHE_NAME = "swanki-media-v1";
const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

/**
 * Cache a single media file by filename.
 */
export async function cacheMediaFile(filename: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const url = `/api/media/${filename}`;
    const existing = await cache.match(url);
    if (existing) {
      return;
    } // Already cached

    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch {
    // Silently fail — media caching is best-effort
  }
}

/**
 * Get a cached media file response.
 * Returns null if not cached.
 */
export async function getCachedMedia(
  filename: string,
): Promise<Response | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const url = `/api/media/${filename}`;
    const response = await cache.match(url);
    return response ?? null;
  } catch {
    return null;
  }
}

/**
 * Cache all media files for the current user.
 * Reads media filenames from the local SQL.js database.
 */
export async function cacheAllUserMedia(db: LocalDrizzleDb): Promise<void> {
  const rows = db.select({ filename: media.filename }).from(media).all();

  // Check current cache size before adding more
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let estimatedSize = keys.length * 100_000; // Rough estimate: 100KB avg

  for (const row of rows) {
    if (estimatedSize >= MAX_CACHE_SIZE_BYTES) {
      break;
    }

    await cacheMediaFile(row.filename);
    estimatedSize += 100_000;
  }
}

/**
 * Clear the media cache.
 */
export async function clearMediaCache(): Promise<void> {
  await caches.delete(CACHE_NAME);
}
