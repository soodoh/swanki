import { app, ipcMain, BrowserWindow } from "electron";
import { join } from "node:path";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import type { AppDb } from "@swanki/core/db";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { notes } from "@swanki/core/db/schema";
import { DeckService } from "@swanki/core/services/deck-service";
import { StudyService } from "@swanki/core/services/study-service";
import { CardService } from "@swanki/core/services/card-service";
import { NoteService } from "@swanki/core/services/note-service";
import { NoteTypeService } from "@swanki/core/services/note-type-service";
import { BrowseService } from "@swanki/core/services/browse-service";
import { StatsService } from "@swanki/core/services/stats-service";
import {
  ImportService,
  detectFormat,
} from "@swanki/core/services/import-service";
import { MediaService } from "@swanki/core/services/media-service";
import { nodeFs } from "@swanki/core/node-filesystem";
import { parseApkg } from "@swanki/core/import/apkg-parser";
import { parseCsv } from "@swanki/core/import/csv-parser";
import {
  parseCrowdAnkiZip,
  parseCrowdAnki,
} from "@swanki/core/import/crowdanki-parser";
import { createJob, updateJob, getJob } from "@swanki/core/import/import-job";
import { stripHtmlToPlainText } from "@swanki/core/lib/field-converter";
import {
  openAuthWindow,
  clearToken,
  isSignedIn,
  getCloudServerUrl,
} from "./auth";
import {
  syncPull,
  getSyncStatus,
  startPeriodicSync,
  stopPeriodicSync,
} from "./sync";

export function registerIpcHandlers(
  db: AppDb,
  rawDb: Database.Database,
  userId: string,
  mediaDir: string,
  mainWindow: BrowserWindow,
): void {
  const deckService = new DeckService(db, mediaDir, nodeFs);
  const studyService = new StudyService(db);
  const cardService = new CardService(db);
  const noteService = new NoteService(db);
  const noteTypeService = new NoteTypeService(db);
  const browseService = new BrowseService(db);
  const statsService = new StatsService(db);
  const importService = new ImportService(db, {
    execSQL: (sql) => rawDb.exec(sql),
  });
  const mediaService = new MediaService(db, mediaDir, nodeFs);

  // Upload directory for import temp files
  const uploadDir = join(app.getPath("userData"), "uploads");
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  const userUploadDir = join(uploadDir, userId);

  function saveUploadedFile(
    filename: string,
    data: Uint8Array,
  ): { fileId: string; format: string; filePath: string } {
    if (!existsSync(userUploadDir)) {
      mkdirSync(userUploadDir, { recursive: true });
    }
    const fileId = crypto.randomUUID();
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    const filePath = join(userUploadDir, `${fileId}${ext}`);
    writeFileSync(filePath, data);
    const format = detectFormat(filename);
    return { fileId, format: format ?? ext.slice(1), filePath };
  }

  function getUploadedFilePath(fileId: string): string | undefined {
    if (!existsSync(userUploadDir)) {
      return undefined;
    }
    const entries = readdirSync(userUploadDir);
    const match = entries.find((name: string) => name.startsWith(fileId));
    return match ? join(userUploadDir, match) : undefined;
  }

  function deleteUploadedFile(fileId: string): void {
    const filePath = getUploadedFilePath(fileId);
    if (filePath) {
      try {
        unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
  }

  // Import: file upload handler (binary data via IPC)
  ipcMain.handle(
    "import:upload",
    async (
      _event,
      { filename, data }: { filename: string; data: Uint8Array },
    ) => {
      const result = saveUploadedFile(filename, data);
      return {
        fileId: result.fileId,
        filename,
        size: data.byteLength,
        format: result.format,
      };
    },
  );

  // Query handler
  ipcMain.handle(
    "db:query",
    async (
      _event,
      {
        endpoint,
        params,
      }: { endpoint: string; params?: Record<string, string> },
    ) => {
      // Deck queries
      if (endpoint === "/api/decks") {
        return await deckService.getTree(userId);
      }

      // Study queries
      const studyMatch = endpoint.match(/^\/api\/study\/(\d+)$/);
      if (studyMatch) {
        return await studyService.getStudySession(
          userId,
          parseInt(studyMatch[1]),
        );
      }

      const previewMatch = endpoint.match(/^\/api\/study\/preview\/(\d+)$/);
      if (previewMatch) {
        return await studyService.getIntervalPreviews(
          userId,
          parseInt(previewMatch[1]),
        );
      }

      // Card counts
      if (
        endpoint === "/api/cards" &&
        params?.counts === "true" &&
        params?.deckId
      ) {
        return await cardService.getDueCounts(userId, parseInt(params.deckId), {
          includeChildren: true,
        });
      }

      // Browse queries
      if (endpoint === "/api/browse" && params?.noteId) {
        return await browseService.getNoteDetail(
          userId,
          parseInt(params.noteId),
        );
      }
      if (endpoint === "/api/browse") {
        return await browseService.search(userId, params?.q ?? "", {
          page: parseInt(params?.page ?? "1"),
          limit: parseInt(params?.limit ?? "50"),
          sortBy: params?.sortBy as "due" | "created" | "updated" | undefined,
          sortDir: params?.sortDir as "asc" | "desc" | undefined,
        });
      }

      // Stats queries
      if (endpoint === "/api/stats" && params?.type === "reviews") {
        return await statsService.getReviewsPerDay(
          userId,
          parseInt(params?.days ?? "30"),
        );
      }
      if (endpoint === "/api/stats" && params?.type === "states") {
        return await statsService.getCardStates(userId);
      }
      if (endpoint === "/api/stats" && params?.type === "streak") {
        return await statsService.getStreak(userId);
      }
      if (endpoint === "/api/stats" && params?.type === "heatmap") {
        return await statsService.getHeatmap(
          userId,
          parseInt(params?.year ?? String(new Date().getFullYear())),
        );
      }

      // Note type queries
      if (endpoint === "/api/note-types") {
        return await noteTypeService.listByUser(userId);
      }
      const sampleNoteMatch = endpoint.match(
        /^\/api\/note-types\/(\d+)\/sample-note$/,
      );
      if (sampleNoteMatch) {
        const fields = await noteTypeService.getFirstNoteFields(
          parseInt(sampleNoteMatch[1]),
          userId,
        );
        return { fields };
      }
      const noteTypeIdMatch = endpoint.match(/^\/api\/note-types\/(\d+)$/);
      if (noteTypeIdMatch) {
        return await noteTypeService.getById(
          parseInt(noteTypeIdMatch[1]),
          userId,
        );
      }

      // Import status polling
      const importStatusMatch = endpoint.match(/^\/api\/import\/status\/(.+)$/);
      if (importStatusMatch) {
        const job = getJob(importStatusMatch[1]);
        if (!job) {
          throw new Error("Job not found or expired");
        }
        return job;
      }

      throw new Error(`Unknown query endpoint: ${endpoint}`);
    },
  );

  // Mutation handler
  ipcMain.handle(
    "db:mutate",
    async (
      _event,
      {
        endpoint,
        method,
        body,
      }: { endpoint: string; method: string; body?: unknown },
    ) => {
      const data = body as Record<string, unknown>;

      // Deck mutations
      if (endpoint === "/api/decks" && method === "POST") {
        return await deckService.create(
          userId,
          data as { name: string; parentId?: number },
        );
      }
      const deckMatch = endpoint.match(/^\/api\/decks\/(\d+)$/);
      if (deckMatch && method === "PUT") {
        return await deckService.update(parseInt(deckMatch[1]), userId, data);
      }
      if (deckMatch && method === "DELETE") {
        return await deckService.delete(parseInt(deckMatch[1]), userId);
      }

      // Study mutations
      if (endpoint === "/api/study/review" && method === "POST") {
        return await studyService.submitReview(
          userId,
          data.cardId as number,
          data.rating as number,
          data.timeTakenMs as number,
        );
      }
      if (endpoint === "/api/study/undo" && method === "POST") {
        return await studyService.undoLastReview(userId, data.cardId as number);
      }

      // Note mutations
      if (endpoint === "/api/notes" && method === "POST") {
        return await noteService.create(
          userId,
          data as {
            noteTypeId: number;
            deckId: number;
            fields: Record<string, string>;
            tags?: string;
          },
        );
      }
      const noteMatch = endpoint.match(/^\/api\/notes\/(\d+)$/);
      if (noteMatch && method === "PUT") {
        return await noteService.update(parseInt(noteMatch[1]), userId, data);
      }
      if (noteMatch && method === "DELETE") {
        await noteService.delete(parseInt(noteMatch[1]), userId);
        return { ok: true };
      }

      // Browse mutations
      if (endpoint === "/api/browse" && method === "PATCH") {
        return await noteService.update(
          data.noteId as number,
          userId,
          data as { fields?: Record<string, string>; tags?: string },
        );
      }
      if (endpoint === "/api/browse" && method === "DELETE") {
        await noteService.delete(data.noteId as number, userId);
        return { ok: true };
      }

      // Note type mutations
      if (endpoint === "/api/note-types" && method === "POST") {
        return await noteTypeService.create(
          userId,
          data as {
            name: string;
            fields: { name: string; ordinal: number }[];
            css?: string;
          },
        );
      }
      const ntMatch = endpoint.match(/^\/api\/note-types\/(\d+)$/);
      if (ntMatch && method === "PUT") {
        return await noteTypeService.update(parseInt(ntMatch[1]), userId, data);
      }
      if (ntMatch && method === "DELETE") {
        await noteTypeService.delete(parseInt(ntMatch[1]), userId);
        return { ok: true };
      }

      // Template mutations
      if (endpoint === "/api/note-types/templates" && method === "POST") {
        return await noteTypeService.addTemplate(
          data.noteTypeId as number,
          userId,
          data as {
            name: string;
            questionTemplate: string;
            answerTemplate: string;
          },
        );
      }
      const tplMatch = endpoint.match(/^\/api\/note-types\/templates\/(\d+)$/);
      if (tplMatch && method === "PUT") {
        return await noteTypeService.updateTemplate(
          parseInt(tplMatch[1]),
          userId,
          data,
        );
      }
      if (tplMatch && method === "DELETE") {
        await noteTypeService.deleteTemplate(parseInt(tplMatch[1]), userId);
        return { ok: true };
      }

      // Import: preview (merge stats)
      if (endpoint === "/api/import/preview" && method === "POST") {
        const fileId = data.fileId as string;
        const mergeMode = data.mergeMode as string | undefined;
        if (!fileId) {
          throw new Error("fileId is required");
        }
        const filePath = getUploadedFilePath(fileId);
        if (!filePath) {
          throw new Error("Upload not found or expired");
        }
        const ext = filePath.slice(filePath.lastIndexOf("."));
        const format = detectFormat(`file${ext}`);

        const fileData = readFileSync(filePath);
        const buffer = fileData.buffer.slice(
          fileData.byteOffset,
          fileData.byteOffset + fileData.byteLength,
        );

        if (format === "crowdanki") {
          const { json } = parseCrowdAnkiZip(buffer);
          const crowdAnkiData = parseCrowdAnki(json);

          // Compute merge stats
          const existingNotes = db
            .select({ ankiGuid: notes.ankiGuid, fields: notes.fields })
            .from(notes)
            .where(eq(notes.userId, userId))
            .all();
          const existingMap = new Map<string, Record<string, string>>();
          for (const n of existingNotes) {
            if (n.ankiGuid) existingMap.set(n.ankiGuid, n.fields);
          }

          const modelMap = new Map(
            crowdAnkiData.noteModels.map((m) => [m.uuid, m]),
          );
          const allNotes = (function collectAll(
            d: typeof crowdAnkiData,
          ): typeof crowdAnkiData.notes {
            const result = [...d.notes];
            for (const child of d.children) result.push(...collectAll(child));
            return result;
          })(crowdAnkiData);

          let newNotes = 0,
            updatedNotes = 0,
            unchangedNotes = 0;
          for (const note of allNotes) {
            if (!note.guid || !existingMap.has(note.guid)) {
              newNotes++;
            } else {
              const model = modelMap.get(note.noteModelUuid);
              const incomingFields: Record<string, string> = {};
              if (model) {
                for (const field of model.fields) {
                  incomingFields[field.name] = note.fields[field.ordinal] ?? "";
                }
              }
              const strippedFields: Record<string, string> = {};
              for (const key of Object.keys(incomingFields)) {
                strippedFields[key] = stripHtmlToPlainText(incomingFields[key]);
              }
              const storedFields = existingMap.get(note.guid)!;
              const fieldsMatch =
                Object.keys(storedFields).length ===
                  Object.keys(strippedFields).length &&
                Object.keys(storedFields).every(
                  (k) => (storedFields[k] ?? "") === (strippedFields[k] ?? ""),
                );
              if (fieldsMatch) unchangedNotes++;
              else updatedNotes++;
            }
          }
          return { mergeStats: { newNotes, updatedNotes, unchangedNotes } };
        }

        // APKG/COLPKG
        const apkgData = parseApkg(buffer, { skipMedia: true });
        if (mergeMode === "merge") {
          const existingNotes = db
            .select({ ankiGuid: notes.ankiGuid, fields: notes.fields })
            .from(notes)
            .where(eq(notes.userId, userId))
            .all();
          const existingMap = new Map<string, Record<string, string>>();
          for (const n of existingNotes) {
            if (n.ankiGuid) existingMap.set(n.ankiGuid, n.fields);
          }

          const noteTypeById = new Map(
            apkgData.noteTypes.map((nt) => [nt.id, nt]),
          );
          let newNotes = 0,
            updatedNotes = 0,
            unchangedNotes = 0;
          for (const ankiNote of apkgData.notes) {
            if (!ankiNote.guid || !existingMap.has(ankiNote.guid)) {
              newNotes++;
            } else {
              const nt = noteTypeById.get(ankiNote.modelId);
              const incomingFields: Record<string, string> = {};
              if (nt) {
                for (const field of nt.fields) {
                  incomingFields[field.name] =
                    ankiNote.fields[field.ordinal] ?? "";
                }
              }
              const strippedFields: Record<string, string> = {};
              for (const key of Object.keys(incomingFields)) {
                strippedFields[key] = stripHtmlToPlainText(incomingFields[key]);
              }
              const storedFields = existingMap.get(ankiNote.guid)!;
              const fieldsMatch =
                Object.keys(storedFields).length ===
                  Object.keys(strippedFields).length &&
                Object.keys(storedFields).every(
                  (k) => (storedFields[k] ?? "") === (strippedFields[k] ?? ""),
                );
              if (fieldsMatch) unchangedNotes++;
              else updatedNotes++;
            }
          }
          return { mergeStats: { newNotes, updatedNotes, unchangedNotes } };
        }
        return {};
      }

      // Import: start async import (APKG/COLPKG)
      if (endpoint === "/api/import/start" && method === "POST") {
        const fileId = data.fileId as string;
        const mergeMode = data.mergeMode as string | undefined;
        if (!fileId) {
          throw new Error("fileId is required");
        }
        const filePath = getUploadedFilePath(fileId);
        if (!filePath) {
          throw new Error("Upload not found or expired");
        }

        const jobId = createJob();
        const merge = mergeMode === "merge";

        // Process asynchronously
        setTimeout(() => {
          void (async () => {
            try {
              updateJob(jobId, {
                phase: "parsing",
                progress: 0,
                detail: "Reading and parsing file...",
              });

              const fileData = readFileSync(filePath);
              const buffer = fileData.buffer.slice(
                fileData.byteOffset,
                fileData.byteOffset + fileData.byteLength,
              );
              const apkgData = parseApkg(buffer);

              updateJob(jobId, {
                phase: "media",
                progress: 0,
                detail: `Importing ${apkgData.media.length} media files...`,
              });

              const { mapping: mediaMapping, warnings: mediaWarnings } =
                await mediaService.importBatch(userId, apkgData.media);
              const mediaCount = mediaMapping.size;

              updateJob(jobId, {
                phase: "notes",
                progress: 0,
                detail: "Importing notes and cards...",
              });

              const result = await importService.importFromApkgBatched(
                userId,
                apkgData,
                mediaMapping,
                merge,
                (phase, progress, detail) => {
                  updateJob(jobId, {
                    phase: phase as "notes" | "cards",
                    progress,
                    detail,
                  });
                },
              );

              updateJob(jobId, {
                status: "complete",
                phase: "cleanup",
                progress: 100,
                detail: "Import complete!",
                result: { ...result, mediaWarnings, mediaCount },
              });

              deleteUploadedFile(fileId);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Import failed";
              updateJob(jobId, {
                status: "error",
                phase: "cleanup",
                progress: 0,
                detail: message,
                error: message,
              });
            }
          })();
        }, 0);

        return { jobId };
      }

      // Import: sync import (CSV/TXT/CrowdAnki via fileId)
      if (
        (endpoint === "/api/import/" || endpoint === "/api/import") &&
        method === "POST"
      ) {
        const fileId = data.fileId as string;
        if (!fileId) {
          throw new Error("fileId is required");
        }
        const filePath = getUploadedFilePath(fileId);
        if (!filePath) {
          throw new Error("Upload not found or expired");
        }
        const ext = filePath.slice(filePath.lastIndexOf("."));
        const format = detectFormat(`file${ext}`);
        if (!format) {
          throw new Error(`Unsupported file format: ${ext}`);
        }

        const fileData = readFileSync(filePath);
        const buffer = fileData.buffer.slice(
          fileData.byteOffset,
          fileData.byteOffset + fileData.byteLength,
        );

        if (format === "apkg" || format === "colpkg") {
          const apkgData = parseApkg(buffer);
          const mergeMode = data.mergeMode as string | undefined;
          const { mapping: mediaMapping, warnings: mediaWarnings } =
            await mediaService.importBatch(userId, apkgData.media);
          const mediaCount = mediaMapping.size;
          const result = await importService.importFromApkg(
            userId,
            apkgData,
            mediaMapping,
            mergeMode === "merge",
          );
          deleteUploadedFile(fileId);
          return { ...result, mediaWarnings, mediaCount };
        }

        if (format === "csv" || format === "txt") {
          const text = fileData.toString("utf-8");
          const delimiter = format === "txt" ? "\t" : ",";
          const parsed = parseCsv(text, { delimiter, hasHeader: true });
          const filename = filePath.slice(filePath.lastIndexOf("/") + 1);
          const deckName =
            filename
              .replace(/\.(csv|txt)$/i, "")
              .replace(/^[a-f0-9-]+\./, "") || "Import";
          const result = await importService.importFromCsv(userId, {
            headers: parsed.headers,
            rows: parsed.rows,
            deckName,
          });
          deleteUploadedFile(fileId);
          return result;
        }

        // CrowdAnki (ZIP)
        const { json, mediaEntries } = parseCrowdAnkiZip(buffer);
        const { mapping: mediaMapping, warnings: mediaWarnings } =
          await mediaService.importBatch(
            userId,
            mediaEntries.map((e, i) => ({
              filename: e.filename,
              index: String(i),
              data: e.data,
            })),
          );
        const mediaCount = mediaMapping.size;
        const result = await importService.importFromCrowdAnki(
          userId,
          json,
          mediaMapping,
        );
        deleteUploadedFile(fileId);
        return { ...result, mediaWarnings, mediaCount };
      }

      throw new Error(`Unknown mutation: ${method} ${endpoint}`);
    },
  );

  // Window control handlers
  ipcMain.handle("window:minimize", () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });
  ipcMain.handle("window:maximize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
    return win?.isMaximized();
  });
  ipcMain.handle("window:close", () => {
    BrowserWindow.getFocusedWindow()?.close();
  });
  ipcMain.handle("window:isMaximized", () => {
    return BrowserWindow.getFocusedWindow()?.isMaximized() ?? false;
  });

  // Auth handlers
  ipcMain.handle("auth:sign-in", async () => {
    const token = await openAuthWindow(mainWindow);
    if (token) {
      // Trigger initial full sync after sign-in
      void syncPull(db, rawDb).then(() => {
        startPeriodicSync(db, rawDb);
      });
      return { signedIn: true };
    }
    return { signedIn: false };
  });

  ipcMain.handle("auth:sign-out", () => {
    stopPeriodicSync();
    clearToken();
    return { signedIn: false };
  });

  ipcMain.handle("auth:status", () => {
    return {
      signedIn: isSignedIn(),
      cloudUrl: getCloudServerUrl(),
    };
  });

  // Sync handlers
  ipcMain.handle("sync:now", async () => {
    await syncPull(db, rawDb);
    return { status: getSyncStatus() };
  });

  ipcMain.handle("sync:status", () => {
    return { status: getSyncStatus() };
  });

  // If already signed in, start periodic sync on launch
  if (isSignedIn()) {
    startPeriodicSync(db, rawDb);
  }
}
