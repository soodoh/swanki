import type { AppTransport } from "@swanki/core/transport";
import type { AppDb, RawSqliteDb } from "@swanki/core/db";
import type { AppFileSystem } from "@swanki/core/filesystem";
import { DeckService } from "@swanki/core/services/deck-service";
import { StudyService } from "@swanki/core/services/study-service";
import { CardService } from "@swanki/core/services/card-service";
import { NoteService } from "@swanki/core/services/note-service";
import { NoteTypeService } from "@swanki/core/services/note-type-service";
import { BrowseService } from "@swanki/core/services/browse-service";
import { StatsService } from "@swanki/core/services/stats-service";
import { ImportService } from "@swanki/core/services/import-service";
import { MediaService } from "@swanki/core/services/media-service";
import { UserSettingsService } from "@swanki/core/services/user-settings-service";

/**
 * Mobile transport — calls core services directly.
 *
 * Unlike IpcTransport (Electron) which serializes over IPC, or WebTransport
 * which goes through HTTP, MobileTransport calls services in the same JS
 * context. This is the simplest transport implementation.
 *
 * The endpoint routing mirrors apps/desktop/electron/ipc-handlers.ts.
 */
export class MobileTransport implements AppTransport {
  private db: AppDb;
  private userId: string;
  private deckService: DeckService;
  private studyService: StudyService;
  private cardService: CardService;
  private noteService: NoteService;
  private noteTypeService: NoteTypeService;
  private browseService: BrowseService;
  private statsService: StatsService;
  private importService: ImportService;
  private mediaService: MediaService;
  private settingsService: UserSettingsService;

  constructor(
    db: AppDb,
    rawDb: RawSqliteDb,
    userId: string,
    mediaDir: string,
    fs: AppFileSystem,
  ) {
    this.db = db;
    this.userId = userId;
    this.deckService = new DeckService(db, mediaDir, fs);
    this.studyService = new StudyService(db);
    this.cardService = new CardService(db);
    this.noteService = new NoteService(db);
    this.noteTypeService = new NoteTypeService(db);
    this.browseService = new BrowseService(db);
    this.statsService = new StatsService(db);
    this.importService = new ImportService(db, rawDb);
    this.mediaService = new MediaService(db, mediaDir, fs);
    this.settingsService = new UserSettingsService(db);
  }

  async query<T>(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<T> {
    return ((await this.queryDecks(endpoint)) ??
      (await this.queryStudy(endpoint)) ??
      (await this.queryCards(endpoint, params)) ??
      (await this.queryBrowse(endpoint, params)) ??
      (await this.queryStats(endpoint, params)) ??
      (await this.queryNoteTypes(endpoint)) ??
      (await this.querySettings(endpoint)) ??
      (() => {
        throw new Error(`Unknown query endpoint: ${endpoint}`);
      })()) as T;
  }

  async mutate<T>(
    endpoint: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<T> {
    const data = body as Record<string, unknown>;
    return ((await this.mutateDeck(endpoint, method, data)) ??
      (await this.mutateStudy(endpoint, method, data)) ??
      (await this.mutateNote(endpoint, method, data)) ??
      (await this.mutateBrowse(endpoint, method, data)) ??
      (await this.mutateNoteType(endpoint, method, data)) ??
      (await this.mutateTemplate(endpoint, method, data)) ??
      (await this.mutateSettings(endpoint, method, data)) ??
      (() => {
        throw new Error(`Unknown mutation: ${method} ${endpoint}`);
      })()) as T;
  }

  // --- Query handlers ---

  private async queryDecks(endpoint: string): Promise<unknown> {
    if (endpoint === "/api/decks") {
      return this.deckService.getTree(this.userId);
    }
    return undefined;
  }

  private async queryStudy(endpoint: string): Promise<unknown> {
    const studyMatch = endpoint.match(/^\/api\/study\/([^/]+)$/);
    if (studyMatch) {
      return this.studyService.getStudySession(this.userId, studyMatch[1]);
    }
    const previewMatch = endpoint.match(/^\/api\/study\/preview\/([^/]+)$/);
    if (previewMatch) {
      return this.studyService.getIntervalPreviews(
        this.userId,
        previewMatch[1],
      );
    }
    return undefined;
  }

  private async queryCards(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<unknown> {
    if (
      endpoint === "/api/cards" &&
      params?.counts === "true" &&
      params?.deckId
    ) {
      return this.cardService.getDueCounts(this.userId, params.deckId, {
        includeChildren: true,
      });
    }
    return undefined;
  }

  private async queryBrowse(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<unknown> {
    if (endpoint === "/api/browse" && params?.noteId) {
      return this.browseService.getNoteDetail(this.userId, params.noteId);
    }
    if (endpoint === "/api/browse") {
      return this.browseService.search(this.userId, params?.q ?? "", {
        page: Number.parseInt(params?.page ?? "1", 10),
        limit: Number.parseInt(params?.limit ?? "50", 10),
        sortBy: params?.sortBy as "due" | "created" | "updated" | undefined,
        sortDir: params?.sortDir as "asc" | "desc" | undefined,
      });
    }
    return undefined;
  }

  private async queryStats(
    endpoint: string,
    params?: Record<string, string>,
  ): Promise<unknown> {
    if (endpoint === "/api/stats" && params?.type === "reviews") {
      return this.statsService.getReviewsPerDay(
        this.userId,
        Number.parseInt(params?.days ?? "30", 10),
      );
    }
    if (endpoint === "/api/stats" && params?.type === "states") {
      return this.statsService.getCardStates(this.userId);
    }
    if (endpoint === "/api/stats" && params?.type === "streak") {
      return this.statsService.getStreak(this.userId);
    }
    if (endpoint === "/api/stats" && params?.type === "heatmap") {
      return this.statsService.getHeatmap(
        this.userId,
        Number.parseInt(params?.year ?? String(new Date().getFullYear()), 10),
      );
    }
    return undefined;
  }

  private async queryNoteTypes(endpoint: string): Promise<unknown> {
    if (endpoint === "/api/note-types") {
      return this.noteTypeService.listByUser(this.userId);
    }
    const sampleNoteMatch = endpoint.match(
      /^\/api\/note-types\/([^/]+)\/sample-note$/,
    );
    if (sampleNoteMatch) {
      const fields = await this.noteTypeService.getFirstNoteFields(
        sampleNoteMatch[1],
        this.userId,
      );
      return { fields };
    }
    const noteTypeIdMatch = endpoint.match(/^\/api\/note-types\/([^/]+)$/);
    if (noteTypeIdMatch) {
      return this.noteTypeService.getById(noteTypeIdMatch[1], this.userId);
    }
    return undefined;
  }

  private async querySettings(endpoint: string): Promise<unknown> {
    if (endpoint === "/api/settings/theme") {
      return this.settingsService.getTheme(this.userId);
    }
    return undefined;
  }

  // --- Mutation handlers ---

  private async mutateDeck(
    endpoint: string,
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (endpoint === "/api/decks" && method === "POST") {
      return this.deckService.create(
        this.userId,
        data as { name: string; parentId?: string },
      );
    }
    const deckMatch = endpoint.match(/^\/api\/decks\/([^/]+)$/);
    if (deckMatch && method === "PUT") {
      return this.deckService.update(deckMatch[1], this.userId, data);
    }
    if (deckMatch && method === "DELETE") {
      await this.deckService.delete(deckMatch[1], this.userId);
      return { ok: true };
    }
    return undefined;
  }

  private async mutateStudy(
    endpoint: string,
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (endpoint === "/api/study/review" && method === "POST") {
      return this.studyService.submitReview(
        this.userId,
        data.cardId as string,
        data.rating as number,
        data.timeTakenMs as number,
      );
    }
    if (endpoint === "/api/study/undo" && method === "POST") {
      return this.studyService.undoLastReview(
        this.userId,
        data.cardId as string,
      );
    }
    return undefined;
  }

  private async mutateNote(
    endpoint: string,
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (endpoint === "/api/notes" && method === "POST") {
      return this.noteService.create(
        this.userId,
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
      return this.noteService.update(noteMatch[1], this.userId, data);
    }
    if (noteMatch && method === "DELETE") {
      await this.noteService.delete(noteMatch[1], this.userId);
      return { ok: true };
    }
    return undefined;
  }

  private async mutateBrowse(
    endpoint: string,
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (endpoint === "/api/browse" && method === "PATCH") {
      return this.noteService.update(
        data.noteId as string,
        this.userId,
        data as { fields?: Record<string, string>; tags?: string },
      );
    }
    if (endpoint === "/api/browse" && method === "DELETE") {
      await this.noteService.delete(data.noteId as string, this.userId);
      return { ok: true };
    }
    return undefined;
  }

  private async mutateNoteType(
    endpoint: string,
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (endpoint === "/api/note-types" && method === "POST") {
      return this.noteTypeService.create(
        this.userId,
        data as {
          name: string;
          fields: Array<{ name: string; ordinal: number }>;
          css?: string;
        },
      );
    }
    const ntMatch = endpoint.match(/^\/api\/note-types\/([^/]+)$/);
    if (ntMatch && method === "PUT") {
      return this.noteTypeService.update(ntMatch[1], this.userId, data);
    }
    if (ntMatch && method === "DELETE") {
      await this.noteTypeService.delete(ntMatch[1], this.userId);
      return { ok: true };
    }
    return undefined;
  }

  private async mutateTemplate(
    endpoint: string,
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (endpoint === "/api/note-types/templates" && method === "POST") {
      return this.noteTypeService.addTemplate(
        data.noteTypeId as string,
        this.userId,
        data as {
          name: string;
          questionTemplate: string;
          answerTemplate: string;
        },
      );
    }
    const tplMatch = endpoint.match(/^\/api\/note-types\/templates\/([^/]+)$/);
    if (tplMatch && method === "PUT") {
      return this.noteTypeService.updateTemplate(
        tplMatch[1],
        this.userId,
        data,
      );
    }
    if (tplMatch && method === "DELETE") {
      await this.noteTypeService.deleteTemplate(tplMatch[1], this.userId);
      return { ok: true };
    }
    return undefined;
  }

  private async mutateSettings(
    endpoint: string,
    method: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (endpoint === "/api/settings/theme" && method === "PUT") {
      await this.settingsService.setTheme(
        this.userId,
        data.theme as "light" | "dark" | "system",
      );
      return { ok: true };
    }
    return undefined;
  }
}
