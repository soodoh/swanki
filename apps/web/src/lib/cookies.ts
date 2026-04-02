/**
 * Cookie utilities that centralize direct document.cookie access.
 * Biome's noDocumentCookie rule flags direct usage, but there is no
 * universally-supported alternative API for cookie operations.
 */

export function getCookie(name: string): string | undefined {
	const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
	return match?.[1];
}

export function deleteCookie(name: string, path = "/"): void {
	// biome-ignore lint/suspicious/noDocumentCookie: no alternative API for deleting cookies
	document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}`;
}

export function setCookie(
	name: string,
	value: string,
	{ path = "/", maxAge }: { path?: string; maxAge?: number } = {},
): void {
	let cookie = `${name}=${value}; path=${path}`;
	if (maxAge !== undefined) cookie += `; max-age=${maxAge}`;
	// biome-ignore lint/suspicious/noDocumentCookie: no alternative API for setting cookies
	document.cookie = cookie;
}
