import type { AppDb } from "@swanki/core/db";
import { user } from "@swanki/core/db/auth-schema";

export function getOrCreateLocalUser(db: AppDb): {
  id: string;
  name: string;
  email: string;
} {
  const existing = db.select().from(user).limit(1).get();
  if (existing) {
    return { id: existing.id, name: existing.name, email: existing.email };
  }

  const id = crypto.randomUUID();
  const localUser = { id, name: "Local User", email: "local@swanki.app" };
  db.insert(user)
    .values({
      id,
      name: localUser.name,
      email: localUser.email,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  return localUser;
}
