import { strFromU8 } from "fflate";
import { decompress as zstdDecompress } from "fzstd";

// --- Shared types ---

export type ApkgNoteType = {
	id: number;
	name: string;
	fields: Array<{ name: string; ordinal: number }>;
	templates: Array<{
		name: string;
		questionFormat: string;
		answerFormat: string;
		ordinal: number;
	}>;
	css: string;
};

export type ApkgDeck = {
	id: number;
	name: string;
};

export type ApkgNote = {
	id: number;
	guid: string;
	modelId: number;
	fields: string[];
	tags: string;
};

export type ApkgCard = {
	id: number;
	noteId: number;
	deckId: number;
	ordinal: number;
	type: number;
	queue: number;
	due: number;
	interval: number;
	factor: number;
	reps: number;
	lapses: number;
};

export type ApkgMediaEntry = {
	filename: string;
	index: string;
	data: Uint8Array;
};

export type ApkgData = {
	decks: ApkgDeck[];
	noteTypes: ApkgNoteType[];
	notes: ApkgNote[];
	cards: ApkgCard[];
	media: ApkgMediaEntry[];
	/** Raw unzipped files, retained when skipMedia is used so media can be read later. */
	_unzipped?: Record<string, Uint8Array>;
};

export type ColRow = { decks: string; models: string };
export type NoteRow = {
	id: number;
	guid: string;
	mid: number;
	flds: string;
	tags: string;
};
export type CardRow = {
	id: number;
	nid: number;
	did: number;
	ord: number;
	type: number;
	queue: number;
	due: number;
	ivl: number;
	factor: number;
	reps: number;
	lapses: number;
};

// prettier-ignore
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

export function isZstdCompressed(data: Uint8Array): boolean {
	if (data.length < 4) {
		return false;
	}
	return (
		data[0] === ZSTD_MAGIC[0] &&
		data[1] === ZSTD_MAGIC[1] &&
		data[2] === ZSTD_MAGIC[2] &&
		data[3] === ZSTD_MAGIC[3]
	);
}

/**
 * Replace "unicase" collation with "nocase " in raw SQLite bytes.
 * Both are exactly 7 bytes, so the replacement is length-preserving
 * and won't corrupt the SQLite page structure.
 */
export function patchUnicaseCollation(data: Uint8Array): Uint8Array {
	// "unicase" = [117, 110, 105, 99, 97, 115, 101]
	// "nocase " = [110, 111, 99, 97, 115, 101, 32]
	const target = new Uint8Array([117, 110, 105, 99, 97, 115, 101]);
	const replacement = new Uint8Array([110, 111, 99, 97, 115, 101, 32]);
	const patched = new Uint8Array(data);
	for (let i = 0; i <= patched.length - 7; i += 1) {
		if (
			patched[i] === target[0] &&
			patched[i + 1] === target[1] &&
			patched[i + 2] === target[2] &&
			patched[i + 3] === target[3] &&
			patched[i + 4] === target[4] &&
			patched[i + 5] === target[5] &&
			patched[i + 6] === target[6]
		) {
			for (let j = 0; j < 7; j += 1) {
				patched[i + j] = replacement[j];
			}
		}
	}
	return patched;
}

export function findDbFile(
	files: Record<string, Uint8Array>,
): string | undefined {
	if ("collection.anki21b" in files) {
		return "collection.anki21b";
	}
	if ("collection.anki21" in files) {
		return "collection.anki21";
	}
	if ("collection.anki2" in files) {
		return "collection.anki2";
	}
	return undefined;
}

/**
 * Decompress the SQLite database bytes if they are zstd-compressed,
 * then patch the unicase collation.
 */
export function prepareDbBytes(dbBytes: Uint8Array): Uint8Array {
	let data = dbBytes;
	if (isZstdCompressed(data)) {
		data = zstdDecompress(data);
	}
	return patchUnicaseCollation(data);
}

// --- Protobuf parsing ---

/** Read a varint from a protobuf buffer, returns [value, bytesConsumed] */
export function readVarint(data: Uint8Array, offset: number): [number, number] {
	let result = 0;
	let shift = 1;
	let pos = offset;
	let byte = data[pos];
	pos += 1;
	while (byte >= 128) {
		result += (byte - 128) * shift;
		shift *= 128;
		byte = data[pos];
		pos += 1;
	}
	result += byte * shift;
	return [result, pos - offset];
}

/** Read a length-delimited protobuf string field */
export function readProtobufString(
	data: Uint8Array,
	offset: number,
	length: number,
): string {
	const bytes = data.slice(offset, offset + length);
	return new TextDecoder().decode(bytes);
}

/** Parse qfmt (field 1) and afmt (field 2) from a template's protobuf config blob */
export function parseTemplateConfig(config: Uint8Array | undefined): {
	qfmt: string;
	afmt: string;
} {
	if (!config || config.length === 0) {
		return { qfmt: "", afmt: "" };
	}

	const data = config instanceof Uint8Array ? config : new Uint8Array(config);
	let qfmt = "";
	let afmt = "";
	let pos = 0;

	while (pos < data.length) {
		const [tagAndType, tagBytes] = readVarint(data, pos);
		pos += tagBytes;
		const wireType = tagAndType % 8;
		const fieldNum = Math.floor(tagAndType / 8);

		if (wireType === 2) {
			const [len, lenBytes] = readVarint(data, pos);
			pos += lenBytes;
			if (fieldNum === 1) {
				qfmt = readProtobufString(data, pos, len);
			} else if (fieldNum === 2) {
				afmt = readProtobufString(data, pos, len);
			}
			pos += len;
		} else if (wireType === 0) {
			const [, vBytes] = readVarint(data, pos);
			pos += vBytes;
		} else if (wireType === 1) {
			pos += 8;
		} else if (wireType === 5) {
			pos += 4;
		} else {
			break;
		}
	}

	return { qfmt, afmt };
}

/** Parse CSS (field 3) from a notetype's protobuf config blob */
export function parseNoteTypeConfig(config: Uint8Array | undefined): {
	css: string;
} {
	if (!config || config.length === 0) {
		return { css: "" };
	}

	const data = config instanceof Uint8Array ? config : new Uint8Array(config);
	let css = "";
	let pos = 0;

	while (pos < data.length) {
		const [tagAndType, tagBytes] = readVarint(data, pos);
		pos += tagBytes;
		const wireType = tagAndType % 8;
		const fieldNum = Math.floor(tagAndType / 8);

		if (wireType === 2) {
			const [len, lenBytes] = readVarint(data, pos);
			pos += lenBytes;
			if (fieldNum === 3) {
				css = readProtobufString(data, pos, len);
			}
			pos += len;
		} else if (wireType === 0) {
			const [, vBytes] = readVarint(data, pos);
			pos += vBytes;
		} else if (wireType === 1) {
			pos += 8;
		} else if (wireType === 5) {
			pos += 4;
		} else {
			break;
		}
	}

	return { css };
}

// --- Media parsing ---

/**
 * Parse the media map file. In older Anki it's JSON, in newer Anki 2.1.50+
 * it may be zstd-compressed protobuf.
 */
function parseMediaMap(data: Uint8Array): Record<string, string> {
	let raw = data;

	if (isZstdCompressed(raw)) {
		raw = zstdDecompress(raw);
	}

	try {
		const str = strFromU8(raw);
		return JSON.parse(str) as Record<string, string>;
	} catch {
		return parseMediaMapProtobuf(raw);
	}
}

function parseMediaMapProtobuf(data: Uint8Array): Record<string, string> {
	const result: Record<string, string> = {};
	let pos = 0;
	let entryIndex = 0;

	while (pos < data.length) {
		const [tagAndType, tagBytes] = readVarint(data, pos);
		pos += tagBytes;
		const wireType = tagAndType % 8;
		const fieldNum = Math.floor(tagAndType / 8);

		if (wireType === 2) {
			const [len, lenBytes] = readVarint(data, pos);
			pos += lenBytes;

			if (fieldNum === 1) {
				const entryData = data.slice(pos, pos + len);
				const filename = parseMediaEntryName(entryData);
				if (filename) {
					result[String(entryIndex)] = filename;
				}
				entryIndex += 1;
			}

			pos += len;
		} else if (wireType === 0) {
			const [, vBytes] = readVarint(data, pos);
			pos += vBytes;
		} else if (wireType === 1) {
			pos += 8;
		} else if (wireType === 5) {
			pos += 4;
		} else {
			break;
		}
	}

	return result;
}

function parseMediaEntryName(data: Uint8Array): string | undefined {
	let pos = 0;

	while (pos < data.length) {
		const [tagAndType, tagBytes] = readVarint(data, pos);
		pos += tagBytes;
		const wireType = tagAndType % 8;
		const fieldNum = Math.floor(tagAndType / 8);

		if (wireType === 2) {
			const [len, lenBytes] = readVarint(data, pos);
			pos += lenBytes;
			if (fieldNum === 1) {
				return readProtobufString(data, pos, len);
			}
			pos += len;
		} else if (wireType === 0) {
			const [, vBytes] = readVarint(data, pos);
			pos += vBytes;
		} else if (wireType === 1) {
			pos += 8;
		} else if (wireType === 5) {
			pos += 4;
		} else {
			break;
		}
	}

	return undefined;
}

/**
 * Count media entries from the manifest without reading binary data.
 */
export function countMedia(files: Record<string, Uint8Array>): number {
	const mediaFile = files.media;
	if (!mediaFile) {
		return 0;
	}
	const mediaMap = parseMediaMap(mediaFile);
	return Object.keys(mediaMap).length;
}

export function readMedia(files: Record<string, Uint8Array>): ApkgMediaEntry[] {
	const mediaFile = files.media;
	if (!mediaFile) {
		return [];
	}

	const mediaMap = parseMediaMap(mediaFile);

	const entries: ApkgMediaEntry[] = [];
	for (const [index, filename] of Object.entries(mediaMap)) {
		let data = files[index];
		if (data) {
			if (isZstdCompressed(data)) {
				data = zstdDecompress(data);
			}
			entries.push({ filename, index, data });
		}
	}

	return entries;
}

// --- Row mapping helpers ---

export function mapNoteRows(rows: NoteRow[]): ApkgNote[] {
	return rows.map((row) => ({
		id: row.id,
		guid: row.guid,
		modelId: row.mid,
		fields: row.flds.split("\u001F"),
		tags: row.tags,
	}));
}

export function mapCardRows(rows: CardRow[]): ApkgCard[] {
	return rows.map((row) => ({
		id: row.id,
		noteId: row.nid,
		deckId: row.did,
		ordinal: row.ord,
		type: row.type,
		queue: row.queue,
		due: row.due,
		interval: row.ivl,
		factor: row.factor,
		reps: row.reps,
		lapses: row.lapses,
	}));
}

export function parseDecksFromJson(decksJson: string): ApkgDeck[] {
	const parsed = JSON.parse(decksJson) as Record<
		string,
		{ id: number; name: string }
	>;
	return Object.values(parsed).map((d) => ({ id: d.id, name: d.name }));
}

export function parseNoteTypesFromJson(modelsJson: string): ApkgNoteType[] {
	const parsed = JSON.parse(modelsJson) as Record<
		string,
		{
			id: number;
			name: string;
			flds: Array<{ name: string; ord: number }>;
			tmpls: Array<{
				name: string;
				qfmt: string;
				afmt: string;
				ord: number;
			}>;
			css?: string;
		}
	>;

	return Object.values(parsed).map((model) => ({
		id: model.id,
		name: model.name,
		fields: model.flds.map((f) => ({
			name: f.name,
			ordinal: f.ord,
		})),
		templates: model.tmpls.map((t) => ({
			name: t.name,
			questionFormat: t.qfmt,
			answerFormat: t.afmt,
			ordinal: t.ord,
		})),
		css: model.css ?? "",
	}));
}
