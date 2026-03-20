// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from "./meta/_journal.json";
import m0000 from "./0000_previous_prodigy.sql";

export const mobileMigrations = {
  journal,
  migrations: {
    // oxlint-disable-next-line typescript-eslint(no-unsafe-assignment) -- .sql imports are untyped
    m0000,
  },
};
