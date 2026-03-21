/// <reference types="bun-types" />
// This file is executed as a bun script for two purposes:
// 1. Migrate:  bun --bun run e2e/setup-db.ts <dbPath>  (run by global-setup.ts)
// 2. Seed:     imported by e2e/seed.ts which is run by global-setup.ts

import { createBunDb } from "../src/db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const dbPath = process.argv[2] || "sqlite-e2e.db";
const { drizzleDb } = createBunDb(dbPath);
migrate(drizzleDb, { migrationsFolder: "./drizzle" });

export function seedData(dbPath: string, userId: string): void {
  const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
  const seedDb = new Database(dbPath);

  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86400;
  const twoDaysAgo = now - 172800;
  const threeDaysAgo = now - 259200;

  seedDb.exec(`
    INSERT OR IGNORE INTO decks (id, user_id, name, parent_id, description, settings, created_at, updated_at) VALUES
      ('a0000000-0000-0000-0000-000000000001', '${userId}', 'Spanish', NULL, '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now}),
      ('a0000000-0000-0000-0000-000000000002', '${userId}', 'Spanish::Verbs', 'a0000000-0000-0000-0000-000000000001', '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now}),
      ('a0000000-0000-0000-0000-000000000003', '${userId}', 'Math', NULL, '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now}),
      ('a0000000-0000-0000-0000-000000000004', '${userId}', 'Empty', NULL, '', '{"newCardsPerDay":20,"maxReviewsPerDay":200}', ${now}, ${now});

    INSERT OR IGNORE INTO note_types (id, user_id, name, fields, css, created_at, updated_at) VALUES
      ('b0000000-0000-0000-0000-000000000001', '${userId}', 'E2E Basic', '[{"name":"Front","ordinal":0},{"name":"Back","ordinal":1}]', '', ${now}, ${now}),
      ('b0000000-0000-0000-0000-000000000002', '${userId}', 'E2E Cloze', '[{"name":"Text","ordinal":0},{"name":"Extra","ordinal":1}]', '', ${now}, ${now});

    INSERT OR IGNORE INTO card_templates (id, note_type_id, name, ordinal, question_template, answer_template, updated_at) VALUES
      ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Card 1', 0, '{{Front}}', '{{FrontSide}}<hr>{{Back}}', ${now}),
      ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}', ${now});

    INSERT OR IGNORE INTO notes (id, user_id, note_type_id, fields, tags, created_at, updated_at) VALUES
      ('d0000000-0000-0000-0000-000000000001', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"hablar","Back":"to speak"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000002', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"comer","Back":"to eat"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000003', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"vivir","Back":"to live"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000004', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"dormir","Back":"to sleep"}', 'verb spanish', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000005', '${userId}', 'b0000000-0000-0000-0000-000000000001', '{"Front":"2+2","Back":"4"}', 'math', ${now}, ${now}),
      ('d0000000-0000-0000-0000-000000000006', '${userId}', 'b0000000-0000-0000-0000-000000000002', '{"Text":"The {{c1::derivative}} of x^2 is 2x","Extra":"Calculus"}', 'math calculus', ${now}, ${now});

    INSERT OR IGNORE INTO cards (id, note_id, deck_id, template_id, ordinal, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, suspended, created_at, updated_at) VALUES
      ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${now}, 0, 0, 0, 0, 0, 0, 0, NULL, 0, ${now}, ${now}),
      ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${oneDayAgo}, 5.0, 5.5, 1, 5, 3, 0, 2, ${twoDaysAgo}, 0, ${threeDaysAgo}, ${oneDayAgo}),
      ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${oneDayAgo}, 4.0, 6.0, 2, 4, 2, 0, 2, ${twoDaysAgo}, 0, ${threeDaysAgo}, ${oneDayAgo}),
      ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 0, ${now}, 0, 0, 0, 0, 0, 0, 0, NULL, 0, ${now}, ${now}),
      ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 0, ${oneDayAgo}, 3.0, 5.0, 1, 3, 1, 0, 2, ${twoDaysAgo}, 0, ${threeDaysAgo}, ${oneDayAgo}),
      ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 0, ${now}, 0, 0, 0, 0, 0, 0, 0, NULL, 0, ${now}, ${now});

    INSERT OR IGNORE INTO review_logs (id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, reviewed_at, time_taken_ms) VALUES
      ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 3, 0, ${threeDaysAgo}, 0, 0, 0, 0, 0, ${threeDaysAgo}, 5000),
      ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 3, 0, ${threeDaysAgo}, 0, 0, 0, 0, 0, ${threeDaysAgo}, 4000),
      ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 3, 2, ${twoDaysAgo}, 3.0, 5.0, 1, 0, 3, ${twoDaysAgo}, 3000),
      ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000005', 3, 0, ${twoDaysAgo}, 0, 0, 0, 0, 0, ${twoDaysAgo}, 6000),
      ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000003', 3, 2, ${oneDayAgo}, 4.0, 5.5, 1, 1, 4, ${oneDayAgo}, 3500);
  `);

  seedDb.close();
}
