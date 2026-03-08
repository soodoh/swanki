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
    it("returns 'system' by default", () => {
      const theme = service.getTheme(userId);
      expect(theme).toBe("system");
    });

    it("returns the stored theme", () => {
      service.setTheme(userId, "dark");
      const theme = service.getTheme(userId);
      expect(theme).toBe("dark");
    });

    it("returns 'system' for non-existent user", () => {
      const theme = service.getTheme("non-existent");
      expect(theme).toBe("system");
    });
  });

  describe("setTheme", () => {
    it("updates theme to dark", () => {
      service.setTheme(userId, "dark");
      const theme = service.getTheme(userId);
      expect(theme).toBe("dark");
    });

    it("updates theme to light", () => {
      service.setTheme(userId, "light");
      const theme = service.getTheme(userId);
      expect(theme).toBe("light");
    });

    it("updates theme back to system", () => {
      service.setTheme(userId, "dark");
      service.setTheme(userId, "system");
      const theme = service.getTheme(userId);
      expect(theme).toBe("system");
    });
  });
});
