export type CsvParseOptions = {
	delimiter?: string;
	hasHeader?: boolean;
};

export type CsvParseResult = {
	headers?: string[];
	rows: string[][];
};

export function parseCsv(
	text: string,
	options?: CsvParseOptions,
): CsvParseResult {
	const delimiter = options?.delimiter ?? ",";
	const hasHeader = options?.hasHeader ?? false;

	if (text.trim() === "") {
		return { headers: undefined, rows: [] };
	}

	const rows = parseRows(text, delimiter);

	if (hasHeader && rows.length > 0) {
		const [headerRow, ...dataRows] = rows;
		return { headers: headerRow, rows: dataRows };
	}

	return { headers: undefined, rows };
}

function parseRows(text: string, delimiter: string): string[][] {
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentField = "";
	let inQuotes = false;
	let i = 0;

	while (i < text.length) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				// Check for escaped quote (double quote)
				if (i + 1 < text.length && text[i + 1] === '"') {
					currentField += '"';
					i += 2;
					continue;
				}
				// End of quoted field
				inQuotes = false;
				i += 1;
				continue;
			}
			currentField += char;
			i += 1;
			continue;
		}

		// Not in quotes
		if (char === '"') {
			inQuotes = true;
			i += 1;
			continue;
		}

		if (
			char === delimiter ||
			(delimiter.length > 1 && text.startsWith(delimiter, i))
		) {
			currentRow.push(currentField);
			currentField = "";
			i += delimiter.length;
			continue;
		}

		if (char === "\r") {
			// Handle \r\n
			if (i + 1 < text.length && text[i + 1] === "\n") {
				i += 1;
			}
			currentRow.push(currentField);
			currentField = "";
			rows.push(currentRow);
			currentRow = [];
			i += 1;
			continue;
		}

		if (char === "\n") {
			currentRow.push(currentField);
			currentField = "";
			rows.push(currentRow);
			currentRow = [];
			i += 1;
			continue;
		}

		currentField += char;
		i += 1;
	}

	// Handle last field/row
	if (currentField !== "" || currentRow.length > 0) {
		currentRow.push(currentField);
		rows.push(currentRow);
	}

	// Remove trailing empty rows
	while (rows.length > 0) {
		const lastRow: string[] = rows[rows.length - 1];
		if (lastRow.length === 1 && lastRow[0] === "") {
			rows.pop();
		} else {
			break;
		}
	}

	return rows;
}
