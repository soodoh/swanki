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

	async getTheme(userId: string): Promise<Theme> {
		const row = await this.db
			.select({ theme: user.theme })
			.from(user)
			.where(eq(user.id, userId))
			.get();
		return (row?.theme as Theme) ?? "system";
	}

	async setTheme(userId: string, theme: Theme): Promise<void> {
		await this.db.update(user).set({ theme }).where(eq(user.id, userId)).run();
	}
}
