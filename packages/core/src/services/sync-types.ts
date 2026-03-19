export type SyncPushRequest = {
  decks: Array<Record<string, unknown>>;
  noteTypes: Array<Record<string, unknown>>;
  cardTemplates: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  reviewLogs: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  noteMedia: Array<Record<string, unknown>>;
  deletions: Array<{ tableName: string; entityId: string; deletedAt: number }>;
};

export type SyncPushResponse = {
  conflicts: Array<{
    tableName: string;
    entityId: string;
    winner: "server" | "client";
  }>;
  mediaToUpload: string[];
  pushedAt: number;
};

export type SyncPullResponse = {
  decks: Array<Record<string, unknown>>;
  noteTypes: Array<Record<string, unknown>>;
  cardTemplates: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  reviewLogs: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
  noteMedia: Array<Record<string, unknown>>;
  deletions: Array<{ tableName: string; entityId: string; deletedAt: number }>;
  syncedAt: number;
};
