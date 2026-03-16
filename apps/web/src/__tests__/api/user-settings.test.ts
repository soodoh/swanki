import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { UserSettingsService } from "../../lib/services/user-settings-service";
import { user } from "../../db/schema";

type TestDb = ReturnType<typeof createTestDb>;

describe("UserSettingsService", () => {
  let db: TestDb;
  let service: UserSettingsService;
  const userId = "user-1";

  beforeEach(() => {
    db = createTestDb();
    service = new UserSettingsService(db);

    // Seed a user
    db.insert(user)
      .values({
        id: userId,
        name: "Test User",
        email: "test@example.com",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  });

  describe("getTheme", () => {
    it("returns 'system' by default", async () => {
      const theme = await service.getTheme(userId);
      expect(theme).toBe("system");
    });

    it("returns the stored theme", async () => {
      await service.setTheme(userId, "dark");
      const theme = await service.getTheme(userId);
      expect(theme).toBe("dark");
    });

    it("returns 'system' for non-existent user", async () => {
      const theme = await service.getTheme("non-existent");
      expect(theme).toBe("system");
    });
  });

  describe("setTheme", () => {
    it("updates theme to dark", async () => {
      await service.setTheme(userId, "dark");
      const theme = await service.getTheme(userId);
      expect(theme).toBe("dark");
    });

    it("updates theme to light", async () => {
      await service.setTheme(userId, "light");
      const theme = await service.getTheme(userId);
      expect(theme).toBe("light");
    });

    it("updates theme back to system", async () => {
      await service.setTheme(userId, "dark");
      await service.setTheme(userId, "system");
      const theme = await service.getTheme(userId);
      expect(theme).toBe("system");
    });
  });
});
