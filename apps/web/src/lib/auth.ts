import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { NoteTypeService } from "./services/note-type-service";

// oxlint-disable-next-line typescript-eslint(no-unsafe-member-access) -- process.env typed as any in Bun
const envVars = process.env as Record<string, string | undefined>;

function createDefaultNoteTypes(userId: string): void {
  const noteTypeService = new NoteTypeService(db);

  const basicFields = [
    { name: "Front", ordinal: 0 },
    { name: "Back", ordinal: 1 },
  ];

  // 1. Basic note type
  const basic = noteTypeService.create(userId, {
    name: "Basic",
    fields: basicFields,
  });
  noteTypeService.addTemplate(basic.id, userId, {
    name: "Card 1",
    questionTemplate: "{{Front}}",
    answerTemplate: '{{FrontSide}}<hr id="answer">{{Back}}',
  });

  // 2. Basic (and reversed card)
  const basicReversed = noteTypeService.create(userId, {
    name: "Basic (and reversed card)",
    fields: basicFields,
  });
  noteTypeService.addTemplate(basicReversed.id, userId, {
    name: "Card 1",
    questionTemplate: "{{Front}}",
    answerTemplate: '{{FrontSide}}<hr id="answer">{{Back}}',
  });
  noteTypeService.addTemplate(basicReversed.id, userId, {
    name: "Card 2",
    questionTemplate: "{{Back}}",
    answerTemplate: '{{FrontSide}}<hr id="answer">{{Front}}',
  });
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: envVars.GOOGLE_CLIENT_ID ?? "",
      clientSecret: envVars.GOOGLE_CLIENT_SECRET ?? "",
    },
    github: {
      clientId: envVars.GITHUB_CLIENT_ID ?? "",
      clientSecret: envVars.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        after: (user) => {
          createDefaultNoteTypes(user.id);
        },
      },
    },
  },
});
