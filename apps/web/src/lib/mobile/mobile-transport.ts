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
    private db: AppDb,
    rawDb: RawSqliteDb,
    private userId: string,
    mediaDir: string,
    fs: AppFileSystem,
  ) {
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
    // Deck queries
    if (endpoint === "/api/decks") {
      return (await this.deckService.getTree(this.userId)) as T;
    }

    // Study queries
    const studyMatch = endpoint.match(/^\/api\/study\/([^/]+)$/);
    if (studyMatch) {
      return (await this.studyService.getStudySession(
        this.userId,
        studyMatch[1],
      )) as T;
    }

    const previewMatch = endpoint.match(/^\/api\/study\/preview\/([^/]+)$/);
    if (previewMatch) {
      return (await this.studyService.getIntervalPreviews(
        this.userId,
        previewMatch[1],
      )) as T;
    }

    // Card counts
    if (
      endpoint === "/api/cards" &&
      params?.counts === "true" &&
      params?.deckId
    ) {
      return (await this.cardService.getDueCounts(this.userId, params.deckId, {
        includeChildren: true,
      })) as T;
    }

    // Browse queries
    if (endpoint === "/api/browse" && params?.noteId) {
      return (await this.browseService.getNoteDetail(
        this.userId,
        params.noteId,
      )) as T;
    }
    if (endpoint === "/api/browse") {
      return (await this.browseService.search(this.userId, params?.q ?? "", {
        page: parseInt(params?.page ?? "1"),
        limit: parseInt(params?.limit ?? "50"),
        sortBy: params?.sortBy as "due" | "created" | "updated" | undefined,
        sortDir: params?.sortDir as "asc" | "desc" | undefined,
      })) as T;
    }

    // Stats queries
    if (endpoint === "/api/stats" && params?.type === "reviews") {
      return (await this.statsService.getReviewsPerDay(
        this.userId,
        parseInt(params?.days ?? "30"),
      )) as T;
    }
    if (endpoint === "/api/stats" && params?.type === "states") {
      return (await this.statsService.getCardStates(this.userId)) as T;
    }
    if (endpoint === "/api/stats" && params?.type === "streak") {
      return (await this.statsService.getStreak(this.userId)) as T;
    }
    if (endpoint === "/api/stats" && params?.type === "heatmap") {
      return (await this.statsService.getHeatmap(
        this.userId,
        parseInt(params?.year ?? String(new Date().getFullYear())),
      )) as T;
    }

    // Note type queries
    if (endpoint === "/api/note-types") {
      return (await this.noteTypeService.listByUser(this.userId)) as T;
    }
    const sampleNoteMatch = endpoint.match(
      /^\/api\/note-types\/([^/]+)\/sample-note$/,
    );
    if (sampleNoteMatch) {
      const fields = await this.noteTypeService.getFirstNoteFields(
        sampleNoteMatch[1],
        this.userId,
      );
      return { fields } as T;
    }
    const noteTypeIdMatch = endpoint.match(/^\/api\/note-types\/([^/]+)$/);
    if (noteTypeIdMatch) {
      return (await this.noteTypeService.getById(
        noteTypeIdMatch[1],
        this.userId,
      )) as T;
    }

    // Settings
    if (endpoint === "/api/settings/theme") {
      return (await this.settingsService.getTheme(this.userId)) as T;
    }

    throw new Error(`Unknown query endpoint: ${endpoint}`);
  }

  async mutate<T>(
    endpoint: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<T> {
    const data = body as Record<string, unknown>;

    // Deck mutations
    if (endpoint === "/api/decks" && method === "POST") {
      return (await this.deckService.create(
        this.userId,
        data as { name: string; parentId?: string },
      )) as T;
    }
    const deckMatch = endpoint.match(/^\/api\/decks\/([^/]+)$/);
    if (deckMatch && method === "PUT") {
      return (await this.deckService.update(
        deckMatch[1],
        this.userId,
        data,
      )) as T;
    }
    if (deckMatch && method === "DELETE") {
      await this.deckService.delete(deckMatch[1], this.userId);
      return { ok: true } as T;
    }

    // Study mutations
    if (endpoint === "/api/study/review" && method === "POST") {
      return (await this.studyService.submitReview(
        this.userId,
        data.cardId as string,
        data.rating as number,
        data.timeTakenMs as number,
      )) as T;
    }
    if (endpoint === "/api/study/undo" && method === "POST") {
      return (await this.studyService.undoLastReview(
        this.userId,
        data.cardId as string,
      )) as T;
    }

    // Note mutations
    if (endpoint === "/api/notes" && method === "POST") {
      return (await this.noteService.create(
        this.userId,
        data as {
          noteTypeId: string;
          deckId: string;
          fields: Record<string, string>;
          tags?: string;
        },
      )) as T;
    }
    const noteMatch = endpoint.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch && method === "PUT") {
      return (await this.noteService.update(
        noteMatch[1],
        this.userId,
        data,
      )) as T;
    }
    if (noteMatch && method === "DELETE") {
      await this.noteService.delete(noteMatch[1], this.userId);
      return { ok: true } as T;
    }

    // Browse mutations
    if (endpoint === "/api/browse" && method === "PATCH") {
      return (await this.noteService.update(
        data.noteId as string,
        this.userId,
        data as { fields?: Record<string, string>; tags?: string },
      )) as T;
    }
    if (endpoint === "/api/browse" && method === "DELETE") {
      await this.noteService.delete(data.noteId as string, this.userId);
      return { ok: true } as T;
    }

    // Note type mutations
    if (endpoint === "/api/note-types" && method === "POST") {
      return (await this.noteTypeService.create(
        this.userId,
        data as {
          name: string;
          fields: { name: string; ordinal: number }[];
          css?: string;
        },
      )) as T;
    }
    const ntMatch = endpoint.match(/^\/api\/note-types\/([^/]+)$/);
    if (ntMatch && method === "PUT") {
      return (await this.noteTypeService.update(
        ntMatch[1],
        this.userId,
        data,
      )) as T;
    }
    if (ntMatch && method === "DELETE") {
      await this.noteTypeService.delete(ntMatch[1], this.userId);
      return { ok: true } as T;
    }

    // Template mutations
    if (endpoint === "/api/note-types/templates" && method === "POST") {
      return (await this.noteTypeService.addTemplate(
        data.noteTypeId as string,
        this.userId,
        data as {
          name: string;
          questionTemplate: string;
          answerTemplate: string;
        },
      )) as T;
    }
    const tplMatch = endpoint.match(/^\/api\/note-types\/templates\/([^/]+)$/);
    if (tplMatch && method === "PUT") {
      return (await this.noteTypeService.updateTemplate(
        tplMatch[1],
        this.userId,
        data,
      )) as T;
    }
    if (tplMatch && method === "DELETE") {
      await this.noteTypeService.deleteTemplate(tplMatch[1], this.userId);
      return { ok: true } as T;
    }

    // Settings mutations
    if (endpoint === "/api/settings/theme" && method === "PUT") {
      await this.settingsService.setTheme(
        this.userId,
        data.theme as "light" | "dark" | "system",
      );
      return { ok: true } as T;
    }

    throw new Error(`Unknown mutation: ${method} ${endpoint}`);
  }
}
