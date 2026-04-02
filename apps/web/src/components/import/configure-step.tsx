import { Settings } from "lucide-react";
import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { DeckTreeNode } from "@/lib/hooks/use-decks";
import { useDecks } from "@/lib/hooks/use-decks";

export type CsvConfig = {
	delimiter: string;
	hasHeader: boolean;
	fieldMapping: Record<number, string>;
	targetDeck: string;
};

export type ApkgConfig = {
	mergeMode: "merge" | "create";
};

export type ImportConfig = {
	csv?: CsvConfig;
	apkg?: ApkgConfig;
};

type ConfigureStepProps = {
	format: string | undefined;
	file: File | undefined;
	config: ImportConfig;
	onConfigChange: (config: ImportConfig) => void;
	csvPreview: string[][] | undefined;
	csvHeaders: string[] | undefined;
};

function flattenDecks(
	nodes: DeckTreeNode[],
): Array<{ id: string; name: string }> {
	const result: Array<{ id: string; name: string }> = [];
	for (const node of nodes) {
		result.push({ id: node.id, name: node.name });
		if (node.children.length > 0) {
			result.push(...flattenDecks(node.children));
		}
	}
	return result;
}

const DEFAULT_FIELDS = ["Front", "Back", "Extra"];

function CsvConfigPanel({
	config,
	onConfigChange,
	csvPreview,
	csvHeaders,
}: {
	config: CsvConfig;
	onConfigChange: (config: CsvConfig) => void;
	csvPreview: string[][] | undefined;
	csvHeaders: string[] | undefined;
}): React.ReactElement {
	const { data: decks } = useDecks();
	const flatDecks = decks ? flattenDecks(decks) : [];

	const columnCount = csvPreview?.[0]?.length ?? csvHeaders?.length ?? 0;

	const handleDelimiterChange = useCallback(
		(delimiter: string) => {
			onConfigChange({ ...config, delimiter });
		},
		[config, onConfigChange],
	);

	const handleHeaderToggle = useCallback(() => {
		onConfigChange({ ...config, hasHeader: !config.hasHeader });
	}, [config, onConfigChange]);

	const handleFieldMapping = useCallback(
		(columnIndex: number, fieldName: string) => {
			const newMapping = { ...config.fieldMapping };
			if (fieldName === "__skip__") {
				Reflect.deleteProperty(newMapping, columnIndex);
			} else {
				newMapping[columnIndex] = fieldName;
			}
			onConfigChange({ ...config, fieldMapping: newMapping });
		},
		[config, onConfigChange],
	);

	const handleDeckChange = useCallback(
		(deckName: string) => {
			onConfigChange({ ...config, targetDeck: deckName });
		},
		[config, onConfigChange],
	);

	return (
		<div className="space-y-5">
			{/* Delimiter */}
			<div className="space-y-1.5">
				<Label className="text-xs">Delimiter</Label>
				<Select value={config.delimiter} onValueChange={handleDelimiterChange}>
					<SelectTrigger className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value=",">Comma (,)</SelectItem>
						<SelectItem value="	">Tab</SelectItem>
						<SelectItem value=";">Semicolon (;)</SelectItem>
						<SelectItem value="|">Pipe (|)</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Header toggle */}
			{/* wraps Checkbox */}
			<label className="flex items-center gap-2">
				<Checkbox
					checked={config.hasHeader}
					onCheckedChange={handleHeaderToggle}
				/>
				<span className="text-sm">First row is header</span>
			</label>

			{/* Field mapping */}
			{columnCount > 0 && (
				<div className="space-y-2">
					<Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Field Mapping
					</Label>
					<div className="space-y-2">
						{Array.from({ length: columnCount }, (_, i) => {
							const headerLabel =
								config.hasHeader && csvHeaders?.[i]
									? csvHeaders[i]
									: `Column ${i + 1}`;

							return (
								<div key={i} className="flex items-center gap-3">
									<span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
										{headerLabel}
									</span>
									<Select
										value={config.fieldMapping[i] ?? "__skip__"}
										onValueChange={(val) => handleFieldMapping(i, val)}
									>
										<SelectTrigger className="w-40 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__skip__">Skip</SelectItem>
											{DEFAULT_FIELDS.map((field) => (
												<SelectItem key={field} value={field}>
													{field}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Target deck */}
			<div className="space-y-1.5">
				<Label className="text-xs">Target Deck</Label>
				<div className="flex gap-2">
					<Input
						value={config.targetDeck}
						onChange={(e) => handleDeckChange(e.target.value)}
						placeholder="Deck name"
						className="flex-1 text-xs"
					/>
					{flatDecks.length > 0 && (
						<Select onValueChange={handleDeckChange}>
							<SelectTrigger className="w-36 text-xs">
								<SelectValue placeholder="Existing..." />
							</SelectTrigger>
							<SelectContent>
								{flatDecks.map((deck) => (
									<SelectItem key={deck.id} value={deck.name}>
										{deck.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
			</div>
		</div>
	);
}

function ApkgConfigPanel({
	config,
	onConfigChange,
	fileName,
}: {
	config: ApkgConfig;
	onConfigChange: (config: ApkgConfig) => void;
	fileName: string;
}): React.ReactElement {
	const deckName = fileName.replace(/\.(apkg|colpkg)$/i, "") || "Import";

	return (
		<div className="space-y-4">
			<div className="rounded-lg border bg-muted/30 p-4">
				<div className="flex items-center gap-2">
					<Settings className="size-4 text-muted-foreground" />
					<span className="text-sm font-medium">Package Details</span>
				</div>
				<div className="mt-3 space-y-1 text-sm text-muted-foreground">
					<p>
						<span className="font-medium text-foreground">Deck name:</span>{" "}
						{deckName}
					</p>
					<p>
						<span className="font-medium text-foreground">Format:</span>{" "}
						{fileName.toLowerCase().endsWith(".colpkg")
							? "Collection Package"
							: "Anki Package"}
					</p>
				</div>
			</div>

			<div className="space-y-2">
				<Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Import Mode
				</Label>
				<div className="space-y-2">
					{/* wraps Checkbox */}
					<label className="flex cursor-pointer items-center gap-2">
						<Checkbox
							checked={config.mergeMode === "merge"}
							onCheckedChange={() =>
								onConfigChange({ ...config, mergeMode: "merge" })
							}
						/>
						<div>
							<span className="text-sm">Merge with existing</span>
							<p className="text-xs text-muted-foreground">
								Update existing notes, add new ones
							</p>
						</div>
					</label>
					{/* wraps Checkbox */}
					<label className="flex cursor-pointer items-center gap-2">
						<Checkbox
							checked={config.mergeMode === "create"}
							onCheckedChange={() =>
								onConfigChange({ ...config, mergeMode: "create" })
							}
						/>
						<div>
							<span className="text-sm">Create new</span>
							<p className="text-xs text-muted-foreground">
								Import as a completely new deck
							</p>
						</div>
					</label>
				</div>
			</div>
		</div>
	);
}

function CrowdAnkiConfigPanel({
	fileName,
}: {
	fileName: string;
}): React.ReactElement {
	const deckName = fileName.replace(/\.zip$/i, "") || "Import";

	return (
		<div className="space-y-4">
			<div className="rounded-lg border bg-muted/30 p-4">
				<div className="flex items-center gap-2">
					<Settings className="size-4 text-muted-foreground" />
					<span className="text-sm font-medium">CrowdAnki Import</span>
				</div>
				<div className="mt-3 space-y-1 text-sm text-muted-foreground">
					<p>
						<span className="font-medium text-foreground">Deck name:</span>{" "}
						{deckName}
					</p>
					<p>
						<span className="font-medium text-foreground">Format:</span>{" "}
						CrowdAnki ZIP
					</p>
				</div>
			</div>
			<p className="text-xs text-muted-foreground">
				The deck structure from the CrowdAnki file will be preserved during
				import.
			</p>
		</div>
	);
}

export function ConfigureStep({
	format,
	file,
	config,
	onConfigChange,
	csvPreview,
	csvHeaders,
}: ConfigureStepProps): React.ReactElement {
	const isCsv = format === "csv" || format === "txt";
	const isApkg = format === "apkg" || format === "colpkg";
	const isCrowdAnki = format === "zip";

	return (
		<div className="space-y-6">
			{isCsv && (
				<CsvConfigPanel
					config={
						config.csv ?? {
							delimiter: format === "txt" ? "\t" : ",",
							hasHeader: true,
							fieldMapping: { 0: "Front", 1: "Back" },
							targetDeck: file?.name.replace(/\.(csv|txt)$/i, "") ?? "Import",
						}
					}
					onConfigChange={(csv) => onConfigChange({ ...config, csv })}
					csvPreview={csvPreview}
					csvHeaders={csvHeaders}
				/>
			)}

			{isApkg && (
				<ApkgConfigPanel
					config={config.apkg ?? { mergeMode: "merge" }}
					onConfigChange={(apkg) => onConfigChange({ ...config, apkg })}
					fileName={file?.name ?? "import.apkg"}
				/>
			)}

			{isCrowdAnki && (
				<CrowdAnkiConfigPanel fileName={file?.name ?? "import.zip"} />
			)}
		</div>
	);
}
