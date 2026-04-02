/**
 * Shared SQL.js initialization singleton and query helpers.
 * Used by the client-side APKG import parser to preview .apkg files in the browser.
 */

import type { Database as SqlJsDatabase } from "sql.js";
import initSqlJs from "sql.js";

export type { SqlJsDatabase };

let sqlJsPromise: ReturnType<typeof initSqlJs> | undefined;

/**
 * Returns a shared SQL.js initialization promise.
 * The WASM binary is self-hosted at /sql-wasm.wasm for offline support.
 */
export function getSqlJs(): ReturnType<typeof initSqlJs> {
	sqlJsPromise ??= initSqlJs({
		locateFile: () => "/sql-wasm.wasm",
	});
	return sqlJsPromise;
}

/** Run a query and return all rows as typed objects. */
export function queryAll<T>(
	db: SqlJsDatabase,
	sql: string,
	params?: unknown[],
): T[] {
	const stmt = db.prepare(sql);
	if (params) {
		stmt.bind(params);
	}
	const results: T[] = [];
	while (stmt.step()) {
		results.push(stmt.getAsObject() as T);
	}
	stmt.free();
	return results;
}

/** Run a query and return the first row or undefined. */
export function queryFirst<T>(
	db: SqlJsDatabase,
	sql: string,
	params?: unknown[],
): T | undefined {
	const stmt = db.prepare(sql);
	if (params) {
		stmt.bind(params);
	}
	let result: T | undefined;
	if (stmt.step()) {
		result = stmt.getAsObject() as T;
	}
	stmt.free();
	return result;
}
