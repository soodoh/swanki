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
import { countMedia } from "@swanki/core/import/apkg-parser-core";
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
  getToken,
} from "./auth";
import {
  syncCycle,
  syncPull,
  getSyncStatus,
  startPeriodicSync,
  stopPeriodicSync,
  setCloudServerUrl,
  getLastSyncTime,
  scheduleSyncAfterMutation,
  reassignUserId,
  initMediaDir,
} from "./sync";

export function registerIpcHandlers(
  db: AppDb,
  rawDb: Database.Database,
  userId: string,
  mediaDir: string,
  mainWindow: BrowserWindow,
): void {
  // Initialise the sync module with the media directory path
  initMediaDir(mediaDir);

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
      const studyMatch = endpoint.match(/^\/api\/study\/([^/]+)$/);
      if (studyMatch) {
        return await studyService.getStudySession(userId, studyMatch[1]);
      }

      const previewMatch = endpoint.match(/^\/api\/study\/preview\/([^/]+)$/);
      if (previewMatch) {
        return await studyService.getIntervalPreviews(userId, previewMatch[1]);
      }

      // Card counts
      if (
        endpoint === "/api/cards" &&
        params?.counts === "true" &&
        params?.deckId
      ) {
        return await cardService.getDueCounts(userId, params.deckId, {
          includeChildren: true,
        });
      }

      // Browse queries
      if (endpoint === "/api/browse" && params?.noteId) {
        return await browseService.getNoteDetail(userId, params.noteId);
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
        /^\/api\/note-types\/([^/]+)\/sample-note$/,
      );
      if (sampleNoteMatch) {
        const fields = await noteTypeService.getFirstNoteFields(
          sampleNoteMatch[1],
          userId,
        );
        return { fields };
      }
      const noteTypeIdMatch = endpoint.match(/^\/api\/note-types\/([^/]+)$/);
      if (noteTypeIdMatch) {
        return await noteTypeService.getById(noteTypeIdMatch[1], userId);
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

  // Mutation handler — wraps all mutation logic and triggers debounced sync on success
  async function handleMutation(
    endpoint: string,
    method: string,
    body?: unknown,
  ): Promise<unknown> {
    const data = body as Record<string, unknown>;

    // Deck mutations
    if (endpoint === "/api/decks" && method === "POST") {
      return await deckService.create(
        userId,
        data as { name: string; parentId?: string },
      );
    }
    const deckMatch = endpoint.match(/^\/api\/decks\/([^/]+)$/);
    if (deckMatch && method === "PUT") {
      return await deckService.update(deckMatch[1], userId, data);
    }
    if (deckMatch && method === "DELETE") {
      return await deckService.delete(deckMatch[1], userId);
    }

    // Study mutations
    if (endpoint === "/api/study/review" && method === "POST") {
      return await studyService.submitReview(
        userId,
        data.cardId as string,
        data.rating as number,
        data.timeTakenMs as number,
      );
    }
    if (endpoint === "/api/study/undo" && method === "POST") {
      return await studyService.undoLastReview(userId, data.cardId as string);
    }

    // Note mutations
    if (endpoint === "/api/notes" && method === "POST") {
      return await noteService.create(
        userId,
        data as {
          noteTypeId: string;
          deckId: string;
          fields: Record<string, string>;
          tags?: string;
        },
      );
    }
    const noteMatch = endpoint.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch && method === "PUT") {
      return await noteService.update(noteMatch[1], userId, data);
    }
    if (noteMatch && method === "DELETE") {
      await noteService.delete(noteMatch[1], userId);
      return { ok: true };
    }

    // Card suspend / bury
    if (endpoint === "/api/cards/suspend" && method === "POST") {
      await cardService.suspendCards(
        data.cardIds as string[],
        userId,
        data.suspend as boolean,
      );
      return { success: true };
    }
    if (endpoint === "/api/cards/bury" && method === "POST") {
      if (data.bury === false) {
        await cardService.unburyCards(data.cardIds as string[], userId);
      } else {
        await cardService.buryCards(data.cardIds as string[], userId);
      }
      return { success: true };
    }

    // Browse mutations
    if (endpoint === "/api/browse" && method === "PATCH") {
      const noteData = await noteService.getById(data.noteId as string, userId);
      if (noteData) {
        if (data.fields || data.tags) {
          await noteService.update(
            data.noteId as string,
            userId,
            data as { fields?: Record<string, string>; tags?: string },
          );
        }
        if (data.deckId) {
          const cardIds = noteData.cards.map((c: { id: string }) => c.id);
          await cardService.moveToDeck(cardIds, data.deckId as string, userId);
        }
        if (typeof data.suspend === "boolean") {
          const cardIds = noteData.cards.map((c: { id: string }) => c.id);
          await cardService.suspendCards(
            cardIds,
            userId,
            data.suspend as boolean,
          );
        }
        if (typeof data.bury === "boolean") {
          const cardIds = noteData.cards.map((c: { id: string }) => c.id);
          if (data.bury) {
            await cardService.buryCards(cardIds, userId);
          } else {
            await cardService.unburyCards(cardIds, userId);
          }
        }
      }
      return { success: true };
    }
    if (endpoint === "/api/browse" && method === "DELETE") {
      await noteService.delete(data.noteId as string, userId);
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
    const ntMatch = endpoint.match(/^\/api\/note-types\/([^/]+)$/);
    if (ntMatch && method === "PUT") {
      return await noteTypeService.update(ntMatch[1], userId, data);
    }
    if (ntMatch && method === "DELETE") {
      await noteTypeService.delete(ntMatch[1], userId);
      return { ok: true };
    }

    // Template mutations
    if (endpoint === "/api/note-types/templates" && method === "POST") {
      return await noteTypeService.addTemplate(
        data.noteTypeId as string,
        userId,
        data as {
          name: string;
          questionTemplate: string;
          answerTemplate: string;
        },
      );
    }
    const tplMatch = endpoint.match(/^\/api\/note-types\/templates\/([^/]+)$/);
    if (tplMatch && method === "PUT") {
      return await noteTypeService.updateTemplate(tplMatch[1], userId, data);
    }
    if (tplMatch && method === "DELETE") {
      await noteTypeService.deleteTemplate(tplMatch[1], userId);
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
        return {
          decks: apkgData.decks.map((d) => ({ name: d.name })),
          noteTypes: apkgData.noteTypes.map((nt) => ({
            name: nt.name,
            fields: nt.fields,
            templates: nt.templates.map((tmpl) => ({
              name: tmpl.name,
              questionFormat: tmpl.questionFormat,
              answerFormat: tmpl.answerFormat,
              ordinal: tmpl.ordinal,
            })),
            css: nt.css,
          })),
          sampleNotes: [],
          totalCards: apkgData.cards.length,
          totalNotes: apkgData.notes.length,
          totalMedia: apkgData._unzipped
            ? countMedia(apkgData._unzipped)
            : apkgData.media.length,
          mergeStats: { newNotes, updatedNotes, unchangedNotes },
        };
      }

      const totalMedia = apkgData._unzipped
        ? countMedia(apkgData._unzipped)
        : apkgData.media.length;
      return {
        decks: apkgData.decks.map((d) => ({ name: d.name })),
        noteTypes: apkgData.noteTypes.map((nt) => ({
          name: nt.name,
          fields: nt.fields,
          templates: nt.templates.map((tmpl) => ({
            name: tmpl.name,
            questionFormat: tmpl.questionFormat,
            answerFormat: tmpl.answerFormat,
            ordinal: tmpl.ordinal,
          })),
          css: nt.css,
        })),
        sampleNotes: [],
        totalCards: apkgData.cards.length,
        totalNotes: apkgData.notes.length,
        totalMedia,
      };
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
          filename.replace(/\.(csv|txt)$/i, "").replace(/^[a-f0-9-]+\./, "") ||
          "Import";
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
  }

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
      const result = await handleMutation(endpoint, method, body);
      // Trigger debounced sync after every successful mutation
      scheduleSyncAfterMutation(db, rawDb);
      return result;
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
    if (!token) {
      return { signedIn: false };
    }

    // Check if any local data exists (decks table)
    const localDeckCount = (
      rawDb.prepare("SELECT COUNT(*) as count FROM decks").get() as {
        count: number;
      }
    ).count;

    if (localDeckCount > 0) {
      // Local data present — ask the user whether to merge or replace
      return { signedIn: true, hasLocalData: true };
    }

    // No local data — do a full pull and start periodic sync
    await syncPull(db, rawDb);
    startPeriodicSync(db, rawDb);
    return { signedIn: true, hasLocalData: false };
  });

  ipcMain.handle(
    "auth:complete-sign-in",
    async (_event, { strategy }: { strategy: "merge" | "replace" }) => {
      if (strategy === "merge") {
        // Fetch the cloud user ID from the session endpoint
        const serverUrl = getCloudServerUrl();
        const token = getToken()!;
        const sessionRes = await fetch(`${serverUrl}/api/auth/get-session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!sessionRes.ok) {
          throw new Error(
            `Failed to fetch cloud session: ${sessionRes.status}`,
          );
        }
        const session = (await sessionRes.json()) as {
          user?: { id?: string };
        };
        const cloudUserId = session?.user?.id;
        if (!cloudUserId) {
          throw new Error("Could not determine cloud user ID from session");
        }

        // Re-assign all local data to the cloud user ID, then sync
        reassignUserId(rawDb, userId, cloudUserId);
        await syncCycle(db, rawDb);
      } else {
        // Replace: delete all local data, then pull from cloud
        const deleteOrder = [
          "note_media",
          "review_logs",
          "cards",
          "notes",
          "card_templates",
          "note_types",
          "decks",
          "media",
          "deletions",
        ];
        const deleteAll = rawDb.transaction(() => {
          for (const table of deleteOrder) {
            rawDb.prepare(`DELETE FROM ${table}`).run();
          }
        });
        deleteAll();
        await syncPull(db, rawDb);
      }

      startPeriodicSync(db, rawDb);
      return { ok: true };
    },
  );

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
    await syncCycle(db, rawDb);
    return { status: getSyncStatus() };
  });

  ipcMain.handle("sync:status", () => {
    return { status: getSyncStatus() };
  });

  // Settings handlers
  ipcMain.handle("settings:get", () => {
    return {
      cloudServerUrl: getCloudServerUrl(),
      signedIn: isSignedIn(),
      syncStatus: getSyncStatus(),
      lastSyncTime: getLastSyncTime(),
    };
  });

  ipcMain.handle(
    "settings:update",
    (_event, { cloudServerUrl }: { cloudServerUrl: string }) => {
      setCloudServerUrl(cloudServerUrl);
      return { ok: true };
    },
  );

  // If already signed in, start periodic sync on launch
  if (isSignedIn()) {
    startPeriodicSync(db, rawDb);
  }
}
