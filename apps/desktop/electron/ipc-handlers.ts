import { ipcMain, BrowserWindow } from "electron";
import type { AppDb } from "@swanki/core/db";
import type Database from "better-sqlite3";
import { DeckService } from "@swanki/core/services/deck-service";
import { StudyService } from "@swanki/core/services/study-service";
import { CardService } from "@swanki/core/services/card-service";
import { NoteService } from "@swanki/core/services/note-service";
import { NoteTypeService } from "@swanki/core/services/note-type-service";
import { BrowseService } from "@swanki/core/services/browse-service";
import { StatsService } from "@swanki/core/services/stats-service";
import { ImportService } from "@swanki/core/services/import-service";
import { MediaService } from "@swanki/core/services/media-service";
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
  const deckService = new DeckService(db, mediaDir);
  const studyService = new StudyService(db);
  const cardService = new CardService(db);
  const noteService = new NoteService(db);
  const noteTypeService = new NoteTypeService(db);
  const browseService = new BrowseService(db);
  const statsService = new StatsService(db);
  const importService = new ImportService(db, rawDb);
  const mediaService = new MediaService(db, mediaDir);

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
        return deckService.getTree(userId);
      }

      // Study queries
      const studyMatch = endpoint.match(/^\/api\/study\/(\d+)$/);
      if (studyMatch) {
        return studyService.getStudySession(userId, parseInt(studyMatch[1]));
      }

      const previewMatch = endpoint.match(/^\/api\/study\/preview\/(\d+)$/);
      if (previewMatch) {
        return studyService.getIntervalPreviews(
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
        return cardService.getDueCounts(userId, parseInt(params.deckId), {
          includeChildren: true,
        });
      }

      // Browse queries
      if (endpoint === "/api/browse" && params?.noteId) {
        return browseService.getNoteDetail(userId, parseInt(params.noteId));
      }
      if (endpoint === "/api/browse") {
        return browseService.search(userId, params?.q ?? "", {
          page: parseInt(params?.page ?? "1"),
          limit: parseInt(params?.limit ?? "50"),
          sortBy: params?.sortBy as "due" | "created" | "updated" | undefined,
          sortDir: params?.sortDir as "asc" | "desc" | undefined,
        });
      }

      // Stats queries
      if (endpoint === "/api/stats" && params?.type === "reviews") {
        return statsService.getReviewsPerDay(
          userId,
          parseInt(params?.days ?? "30"),
        );
      }
      if (endpoint === "/api/stats" && params?.type === "states") {
        return statsService.getCardStates(userId);
      }
      if (endpoint === "/api/stats" && params?.type === "streak") {
        return statsService.getStreak(userId);
      }
      if (endpoint === "/api/stats" && params?.type === "heatmap") {
        return statsService.getHeatmap(
          userId,
          parseInt(params?.year ?? String(new Date().getFullYear())),
        );
      }

      // Note type queries
      if (endpoint === "/api/note-types") {
        return noteTypeService.listByUser(userId);
      }
      const sampleNoteMatch = endpoint.match(
        /^\/api\/note-types\/(\d+)\/sample-note$/,
      );
      if (sampleNoteMatch) {
        const fields = noteTypeService.getFirstNoteFields(
          parseInt(sampleNoteMatch[1]),
          userId,
        );
        return { fields };
      }
      const noteTypeIdMatch = endpoint.match(/^\/api\/note-types\/(\d+)$/);
      if (noteTypeIdMatch) {
        return noteTypeService.getById(parseInt(noteTypeIdMatch[1]), userId);
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
        return deckService.create(
          userId,
          data as { name: string; parentId?: number },
        );
      }
      const deckMatch = endpoint.match(/^\/api\/decks\/(\d+)$/);
      if (deckMatch && method === "PUT") {
        return deckService.update(parseInt(deckMatch[1]), userId, data);
      }
      if (deckMatch && method === "DELETE") {
        return deckService.delete(parseInt(deckMatch[1]), userId);
      }

      // Study mutations
      if (endpoint === "/api/study/review" && method === "POST") {
        return studyService.submitReview(
          userId,
          data.cardId as number,
          data.rating as number,
          data.timeTakenMs as number,
        );
      }
      if (endpoint === "/api/study/undo" && method === "POST") {
        return studyService.undoLastReview(userId, data.cardId as number);
      }

      // Note mutations
      if (endpoint === "/api/notes" && method === "POST") {
        return noteService.create(
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
        return noteService.update(parseInt(noteMatch[1]), userId, data);
      }
      if (noteMatch && method === "DELETE") {
        noteService.delete(parseInt(noteMatch[1]), userId);
        return { ok: true };
      }

      // Browse mutations
      if (endpoint === "/api/browse" && method === "PATCH") {
        return noteService.update(
          data.noteId as number,
          userId,
          data as { fields?: Record<string, string>; tags?: string },
        );
      }
      if (endpoint === "/api/browse" && method === "DELETE") {
        noteService.delete(data.noteId as number, userId);
        return { ok: true };
      }

      // Note type mutations
      if (endpoint === "/api/note-types" && method === "POST") {
        return noteTypeService.create(
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
        return noteTypeService.update(parseInt(ntMatch[1]), userId, data);
      }
      if (ntMatch && method === "DELETE") {
        noteTypeService.delete(parseInt(ntMatch[1]), userId);
        return { ok: true };
      }

      // Template mutations
      if (endpoint === "/api/note-types/templates" && method === "POST") {
        return noteTypeService.addTemplate(
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
        return noteTypeService.updateTemplate(
          parseInt(tplMatch[1]),
          userId,
          data,
        );
      }
      if (tplMatch && method === "DELETE") {
        noteTypeService.deleteTemplate(parseInt(tplMatch[1]), userId);
        return { ok: true };
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
