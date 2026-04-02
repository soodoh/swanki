import { electron } from "@better-auth/electron";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { NoteTypeService } from "./services/note-type-service";

const envVars = process.env as Record<string, string | undefined>;

async function createDefaultNoteTypes(userId: string): Promise<void> {
	const noteTypeService = new NoteTypeService(db);

	const basicFields = [
		{ name: "Front", ordinal: 0 },
		{ name: "Back", ordinal: 1 },
	];

	// 1. Basic note type
	const basic = await noteTypeService.create(userId, {
		name: "Basic",
		fields: basicFields,
	});
	await noteTypeService.addTemplate(basic.id, userId, {
		name: "Card 1",
		questionTemplate: "{{Front}}",
		answerTemplate: '{{FrontSide}}<hr id="answer">{{Back}}',
	});

	// 2. Basic (and reversed card)
	const basicReversed = await noteTypeService.create(userId, {
		name: "Basic (and reversed card)",
		fields: basicFields,
	});
	await noteTypeService.addTemplate(basicReversed.id, userId, {
		name: "Card 1",
		questionTemplate: "{{Front}}",
		answerTemplate: '{{FrontSide}}<hr id="answer">{{Back}}',
	});
	await noteTypeService.addTemplate(basicReversed.id, userId, {
		name: "Card 2",
		questionTemplate: "{{Back}}",
		answerTemplate: '{{FrontSide}}<hr id="answer">{{Front}}',
	});
}

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "sqlite" }),
	trustedOrigins: [
		"app://.",
		"file://",
		"http://localhost:5173", // Electron Vite dev server
		"swanki:/", // Electron deep link protocol
	],
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
	plugins: [electron()],
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await createDefaultNoteTypes(user.id);
				},
			},
		},
	},
});
