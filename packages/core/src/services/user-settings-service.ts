import { eq } from "drizzle-orm";
import type { AppDb } from "../db/index";
import { user } from "../db/schema";

type Db = AppDb;
type Theme = "light" | "dark" | "system";

export class UserSettingsService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  getTheme(userId: string): Theme {
    const row = this.db
      .select({ theme: user.theme })
      .from(user)
      .where(eq(user.id, userId))
      .get();
    return (row?.theme as Theme) ?? "system";
  }

  setTheme(userId: string, theme: Theme): void {
    this.db.update(user).set({ theme }).where(eq(user.id, userId)).run();
  }
}
