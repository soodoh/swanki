import { eq, and } from "drizzle-orm";
import type { AppDb } from "../db/index";
import { media, noteMedia } from "../db/schema";
import type { AppFileSystem } from "../filesystem";

type Db = AppDb;

type MediaRecord = typeof media.$inferSelect;

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/"] as const;

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    avif: "image/avif",
    ico: "image/x-icon",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    opus: "audio/opus",
    mp4: "video/mp4",
    webm: "video/webm",
    "3gp": "video/3gpp",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}

export class MediaService {
  private db: Db;
  constructor(
    db: Db,
    private mediaDir: string,
    private fs: AppFileSystem,
  ) {
    this.db = db;
  }

  private async ensureMediaDir(): Promise<void> {
    try {
      await this.fs.mkdir(this.mediaDir, { recursive: true });
    } catch {
      // Directory already exists or can't be created
    }
  }

  async upload(userId: string, file: File): Promise<MediaRecord> {
    await this.ensureMediaDir();

    // Validate MIME type to prevent serving arbitrary content (e.g. text/html XSS)
    const mimeType = file.type || "application/octet-stream";
    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
      mimeType.startsWith(prefix),
    );
    if (!isAllowed) {
      throw new Error(
        `Unsupported file type: ${mimeType}. Only image, audio, and video files are allowed.`,
      );
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Hash with SHA-256
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const hashArray = [...new Uint8Array(hashBuffer)];
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Check for duplicates by hash
    const existing = await this.db
      .select()
      .from(media)
      .where(eq(media.hash, hash))
      .get();

    if (existing) {
      return existing;
    }

    // Generate a unique filename preserving the extension
    const ext: string = file.name.includes(".")
      ? `.${file.name.split(".").pop()}`
      : "";
    const filename = `${hash}${ext}`;

    // Write to disk
    await this.ensureMediaDir();
    const filePath = this.fs.join(this.mediaDir, filename);
    await this.fs.writeFile(filePath, bytes);

    // Record in DB
    const now = new Date();

    const record = await this.db
      .insert(media)
      .values({
        userId,
        filename,
        hash,
        mimeType,
        size: bytes.length,
        createdAt: now,
      })
      .returning()
      .get();
    return record;
  }

  async importBatch(
    userId: string,
    entries: Array<{ filename: string; index: string; data: Uint8Array }>,
  ): Promise<{ mapping: Map<string, string>; warnings: string[] }> {
    await this.ensureMediaDir();

    const mapping = new Map<string, string>();
    const warnings: string[] = [];

    // Phase 1: Hash all files in parallel
    const nonEmpty = entries.filter((e) => {
      if (e.data.length === 0) {
        warnings.push(`Skipped empty file: ${e.filename}`);
        return false;
      }
      return true;
    });

    const hashes = await Promise.all(
      nonEmpty.map(async (entry) => {
        const buf = await crypto.subtle.digest("SHA-256", entry.data);
        return [...new Uint8Array(buf)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }),
    );

    // Phase 2: Deduplicate + check DB for existing
    type PendingWrite = {
      entry: (typeof nonEmpty)[number];
      hash: string;
      filename: string;
      mimeType: string;
      fileOnly?: boolean; // true when DB record exists but file is missing
    };
    const pendingWrites: PendingWrite[] = [];
    const seenHashes = new Map<string, string>(); // hash → filename (in-batch dedup)

    for (let i = 0; i < nonEmpty.length; i += 1) {
      const entry = nonEmpty[i];
      const hash = hashes[i];

      // In-batch dedup: if we've already seen this hash in the current batch
      const inBatchFilename = seenHashes.get(hash);
      if (inBatchFilename) {
        mapping.set(entry.filename, inBatchFilename);
        continue;
      }

      const existing = await this.db
        .select()
        .from(media)
        .where(eq(media.hash, hash))
        .get();

      if (existing) {
        mapping.set(entry.filename, existing.filename);
        seenHashes.set(hash, existing.filename);
        // Re-write file if DB record exists but file is missing from disk
        const existingPath = this.fs.join(this.mediaDir, existing.filename);
        if (!(await this.fs.exists(existingPath))) {
          pendingWrites.push({
            entry,
            hash,
            filename: existing.filename,
            mimeType: existing.mimeType,
            fileOnly: true,
          });
        }
        continue;
      }

      const ext = entry.filename.includes(".")
        ? `.${entry.filename.split(".").pop()}`
        : "";
      const filename = `${hash}${ext}`;
      const mimeType = guessMimeType(entry.filename);
      seenHashes.set(hash, filename);

      // Skip files with unsupported MIME types (e.g. SVG can execute JS)
      const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
        mimeType.startsWith(prefix),
      );
      if (!isAllowed) {
        warnings.push(
          `Skipped unsupported file type: ${entry.filename} (${mimeType})`,
        );
        continue;
      }

      pendingWrites.push({ entry, hash, filename, mimeType });
    }

    // Phase 3: Write new files in parallel batches + insert DB records
    const BATCH_SIZE = 20;
    for (let i = 0; i < pendingWrites.length; i += BATCH_SIZE) {
      const batch = pendingWrites.slice(i, i + BATCH_SIZE);

      await this.ensureMediaDir();
      for (const { entry, filename } of batch) {
        const filePath = this.fs.join(this.mediaDir, filename);
        await this.fs.writeFile(filePath, entry.data);
      }

      for (const { entry, hash, filename, mimeType, fileOnly } of batch) {
        if (!fileOnly) {
          await this.db
            .insert(media)
            .values({
              userId,
              filename,
              hash,
              mimeType,
              size: entry.data.length,
              createdAt: new Date(),
            })
            .run();

          mapping.set(entry.filename, filename);
        }
      }
    }

    return { mapping, warnings, mediaCount: mapping.size };
  }

  async getByFilename(
    filename: string,
  ): Promise<{ record: MediaRecord; filePath: string } | undefined> {
    const record = await this.db
      .select()
      .from(media)
      .where(eq(media.filename, filename))
      .get();

    if (!record) {
      return undefined;
    }

    const filePath = this.fs.join(this.mediaDir, record.filename);
    return { record, filePath };
  }

  async reconcileNoteReferences(
    noteId: number,
    currentFilenames: string[],
  ): Promise<void> {
    const existingRefs = await this.db
      .select()
      .from(noteMedia)
      .where(eq(noteMedia.noteId, noteId))
      .all();

    const existingMediaIds = new Set(existingRefs.map((r) => r.mediaId));

    const currentMediaIds = new Set<number>();
    for (const filename of currentFilenames) {
      const record = await this.db
        .select()
        .from(media)
        .where(eq(media.filename, filename))
        .get();
      if (record) {
        currentMediaIds.add(record.id);
      }
    }

    // Add new references
    for (const mediaId of currentMediaIds) {
      if (!existingMediaIds.has(mediaId)) {
        await this.db
          .insert(noteMedia)
          .values({ noteId, mediaId })
          .onConflictDoNothing()
          .run();
      }
    }

    // Remove stale references and clean up orphans
    for (const ref of existingRefs) {
      if (!currentMediaIds.has(ref.mediaId)) {
        await this.db
          .delete(noteMedia)
          .where(
            and(
              eq(noteMedia.noteId, noteId),
              eq(noteMedia.mediaId, ref.mediaId),
            ),
          )
          .run();

        // Check if media is now orphaned
        const remaining = await this.db
          .select()
          .from(noteMedia)
          .where(eq(noteMedia.mediaId, ref.mediaId))
          .all();

        if (remaining.length === 0) {
          const mediaRecord = await this.db
            .select()
            .from(media)
            .where(eq(media.id, ref.mediaId))
            .get();

          if (mediaRecord) {
            const filePath = this.fs.join(this.mediaDir, mediaRecord.filename);
            try {
              await this.fs.unlink(filePath);
            } catch {
              // File may already be gone
            }
            await this.db.delete(media).where(eq(media.id, ref.mediaId)).run();
          }
        }
      }
    }
  }
}
