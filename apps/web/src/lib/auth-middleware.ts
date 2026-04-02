import { auth } from "./auth";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export async function getSession(
	request: Request,
): Promise<Session | undefined> {
	const session = await auth.api.getSession({
		headers: request.headers,
	});
	return session ?? undefined;
}

export async function requireSession(request: Request): Promise<Session> {
	const session = await getSession(request);
	if (!session) {
		// TanStack Start uses thrown Responses for HTTP error handling
		throw Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return session;
}
