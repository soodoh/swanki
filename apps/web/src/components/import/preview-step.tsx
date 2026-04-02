import {
	AlertTriangle,
	FileText,
	Image,
	Info,
	Layers,
	Minus,
	Plus,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApkgCardPreview } from "@/components/import/apkg-card-preview";
import { Badge } from "@/components/ui/badge";
import type { CarouselApi } from "@/components/ui/carousel";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
	useCarousel,
} from "@/components/ui/carousel";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ApkgPreviewData } from "@/lib/import/apkg-parser-client";
import { cn } from "@/lib/utils";

type PreviewStepProps = {
	file: File | undefined;
	format: string | undefined;
	sampleCards: Array<{ fields: Record<string, string> }>;
	totalCards: number;
	duplicateCount: number;
	apkgPreview?: ApkgPreviewData;
	previewLoading?: boolean;
	previewError?: string;
};

function CsvPreview({
	sampleCards,
	totalCards,
}: {
	sampleCards: Array<{ fields: Record<string, string> }>;
	totalCards: number;
}): React.ReactElement {
	const fieldNames =
		sampleCards.length > 0 ? Object.keys(sampleCards[0].fields) : [];

	if (sampleCards.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
				<p className="text-sm text-muted-foreground">
					No preview data available
				</p>
			</div>
		);
	}

	return (
		<div>
			<h3 className="mb-2 text-sm font-medium">
				Sample ({Math.min(sampleCards.length, 5)} of {totalCards} cards)
			</h3>
			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10">#</TableHead>
							{fieldNames.map((name) => (
								<TableHead key={name}>{name}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{sampleCards.slice(0, 5).map((card, index) => (
							<TableRow key={Object.values(card.fields).join("|")}>
								<TableCell className="text-muted-foreground">
									{index + 1}
								</TableCell>
								{fieldNames.map((name) => {
									const value: string = card.fields[name] ?? "";
									const stripped = value.replace(/<[^>]*>/g, "");
									const display =
										stripped.length > 80
											? `${stripped.slice(0, 80)}...`
											: stripped;
									return (
										<TableCell key={name} className="max-w-[200px] truncate">
											{display ?? (
												<span className="text-muted-foreground italic">
													empty
												</span>
											)}
										</TableCell>
									);
								})}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

function CarouselDots(): React.ReactNode {
	const { api } = useCarousel();
	const [current, setCurrent] = useState(0);
	const [count, setCount] = useState(0);

	const onSelect = useCallback(() => {
		if (!api) {
			return;
		}
		setCurrent(api.selectedScrollSnap());
	}, [api]);

	useEffect(() => {
		if (!api) {
			return;
		}
		setCount(api.scrollSnapList().length);
		setCurrent(api.selectedScrollSnap());
		api.on("select", onSelect);
		return () => {
			api.off("select", onSelect);
		};
	}, [api, onSelect]);

	if (count <= 1) {
		return null;
	}

	return (
		<div className="flex justify-center gap-1.5 pt-2">
			{Array.from({ length: count }, (_, i) => (
				<button
					// stable dot order - index is the identity for carousel dots
					key={`dot-${String(i)}`}
					type="button"
					className={cn(
						"size-2 rounded-full transition-colors",
						i === current ? "bg-primary" : "bg-muted-foreground/30",
					)}
					onClick={() => api?.scrollTo(i)}
					aria-label={`Go to slide ${i + 1}`}
				/>
			))}
		</div>
	);
}

function ApkgPreview({
	preview,
}: {
	preview: ApkgPreviewData;
}): React.ReactElement {
	const noteTypeMap = new Map(preview.noteTypes.map((nt) => [nt.name, nt]));
	const [current, setCurrent] = useState(0);
	const [api, setApi] = useState<CarouselApi>();

	useEffect(() => {
		if (!api) {
			return;
		}
		const onSelect = () => setCurrent(api.selectedScrollSnap());
		setCurrent(api.selectedScrollSnap());
		api.on("select", onSelect);
		return () => {
			api.off("select", onSelect);
		};
	}, [api]);

	const validNotes = preview.sampleNotes.filter((note) =>
		noteTypeMap.has(note.noteTypeName),
	);

	return (
		<div className="space-y-4">
			<h3 className="text-sm font-medium">
				Card {current + 1} of {validNotes.length} samples ({preview.totalNotes}{" "}
				total notes)
			</h3>

			<Carousel setApi={setApi} className="mx-12">
				<CarouselContent>
					{validNotes.map((note, index) => {
						const noteType = noteTypeMap.get(note.noteTypeName);
						if (!noteType) return null;
						const firstField = Object.values(note.fields)[0] ?? "";
						const keyStr = `${note.noteTypeName}-${firstField.slice(0, 40)}`;
						return (
							<CarouselItem key={keyStr}>
								<ApkgCardPreview
									noteTypeName={note.noteTypeName}
									fields={note.fields}
									noteType={noteType}
									index={index}
								/>
							</CarouselItem>
						);
					})}
				</CarouselContent>
				<CarouselPrevious />
				<CarouselNext />
				<CarouselDots />
			</Carousel>

			<div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
				<Info className="mt-0.5 size-4 text-muted-foreground" />
				<p className="text-xs text-muted-foreground">
					Media files (images, audio) will display after import.
				</p>
			</div>
		</div>
	);
}

function ApkgContentArea({
	previewLoading,
	previewError,
	apkgPreview,
}: {
	previewLoading?: boolean;
	previewError?: string;
	apkgPreview?: ApkgPreviewData;
}): React.ReactElement {
	if (previewLoading) {
		return <PreviewSkeleton />;
	}
	if (previewError) {
		return (
			<div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 py-8">
				<p className="text-sm text-destructive">{previewError}</p>
			</div>
		);
	}
	if (apkgPreview) {
		return <ApkgPreview preview={apkgPreview} />;
	}
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
			<p className="text-sm text-muted-foreground">No preview data available</p>
		</div>
	);
}

function PreviewSkeleton(): React.ReactElement {
	return (
		<div className="space-y-4">
			<div className="h-5 w-56 animate-pulse rounded bg-muted" />

			<div className="relative mx-12">
				{/* Single card skeleton matching ApkgCardPreview layout */}
				<div className="animate-pulse overflow-hidden rounded-lg border">
					{/* Header: index + badge + show back button */}
					<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
						<div className="flex items-center gap-2">
							<div className="h-4 w-5 rounded bg-muted" />
							<div className="h-5 w-20 rounded-full bg-muted" />
						</div>
						<div className="h-7 w-20 rounded bg-muted" />
					</div>
					{/* Body: "Front" label + content lines */}
					<div className="p-4">
						<div className="mb-2 h-3 w-10 rounded bg-muted" />
						<div className="space-y-2">
							<div className="h-4 w-5/6 rounded bg-muted" />
							<div className="h-4 w-3/4 rounded bg-muted" />
							<div className="h-4 w-1/2 rounded bg-muted" />
						</div>
					</div>
				</div>

				{/* Prev/next arrow placeholders */}
				<div className="absolute -left-12 top-1/2 size-8 -translate-y-1/2 rounded-full border bg-background" />
				<div className="absolute -right-12 top-1/2 size-8 -translate-y-1/2 rounded-full border bg-background" />
			</div>

			{/* Dot indicators */}
			<div className="flex justify-center gap-1.5 pt-2">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className={cn(
							"size-2 rounded-full",
							i === 0 ? "bg-primary" : "bg-muted-foreground/30",
						)}
					/>
				))}
			</div>

			{/* Info box skeleton */}
			<div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
				<Info className="mt-0.5 size-4 text-muted-foreground" />
				<div className="h-4 w-64 animate-pulse rounded bg-muted" />
			</div>
		</div>
	);
}

function MergeStatsBadges({
	mergeStats,
}: {
	mergeStats: NonNullable<ApkgPreviewData["mergeStats"]>;
}): React.ReactElement {
	return (
		<>
			<div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
				<Plus className="size-4 text-green-600 dark:text-green-400" />
				<div>
					<p className="text-sm font-medium text-green-600 dark:text-green-400">
						{mergeStats.newNotes}
					</p>
					<p className="text-xs text-muted-foreground">New</p>
				</div>
			</div>
			{mergeStats.updatedNotes > 0 && (
				<div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
					<RefreshCw className="size-4 text-blue-600 dark:text-blue-400" />
					<div>
						<p className="text-sm font-medium text-blue-600 dark:text-blue-400">
							{mergeStats.updatedNotes}
						</p>
						<p className="text-xs text-muted-foreground">Updated</p>
					</div>
				</div>
			)}
			{mergeStats.unchangedNotes > 0 && (
				<div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
					<Minus className="size-4 text-muted-foreground" />
					<div>
						<p className="text-sm font-medium text-muted-foreground">
							{mergeStats.unchangedNotes}
						</p>
						<p className="text-xs text-muted-foreground">Unchanged</p>
					</div>
				</div>
			)}
		</>
	);
}

// preview component with multiple format-specific branches
export function PreviewStep({
	file,
	format,
	sampleCards,
	totalCards,
	duplicateCount,
	apkgPreview,
	previewLoading,
	previewError,
}: PreviewStepProps): React.ReactElement {
	const isApkg = format === "apkg" || format === "colpkg";
	const hasRichPreview = isApkg || format === "zip";

	return (
		<div className="space-y-6">
			{/* Summary stats */}
			<div className="flex flex-wrap gap-4">
				<div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
					<FileText className="size-4 text-muted-foreground" />
					<div>
						<p className="text-sm font-medium">
							{hasRichPreview ? (apkgPreview?.totalCards ?? "...") : totalCards}
						</p>
						<p className="text-xs text-muted-foreground">Total cards</p>
					</div>
				</div>

				{hasRichPreview && apkgPreview && (
					<>
						<div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
							<Layers className="size-4 text-muted-foreground" />
							<div>
								<p className="text-sm font-medium">
									{apkgPreview.decks.length}
								</p>
								<p className="text-xs text-muted-foreground">Decks</p>
							</div>
						</div>

						{apkgPreview.totalMedia > 0 && (
							<div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
								<Image className="size-4 text-muted-foreground" />
								<div>
									<p className="text-sm font-medium">
										{apkgPreview.totalMedia}
									</p>
									<p className="text-xs text-muted-foreground">Media files</p>
								</div>
							</div>
						)}
					</>
				)}

				{hasRichPreview && apkgPreview?.mergeStats && (
					<MergeStatsBadges mergeStats={apkgPreview.mergeStats} />
				)}

				{!hasRichPreview && duplicateCount > 0 && (
					<div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
						<AlertTriangle className="size-4 text-amber-500" />
						<div>
							<p className="text-sm font-medium text-amber-600 dark:text-amber-400">
								{duplicateCount}
							</p>
							<p className="text-xs text-muted-foreground">Duplicates</p>
						</div>
					</div>
				)}

				<div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
					<Badge variant="secondary">{format?.toUpperCase()}</Badge>
					<div>
						<p className="text-sm font-medium truncate max-w-[150px]">
							{file?.name ?? "Unknown"}
						</p>
						<p className="text-xs text-muted-foreground">Source file</p>
					</div>
				</div>
			</div>

			{/* Content area */}
			{hasRichPreview ? (
				<ApkgContentArea
					previewLoading={previewLoading}
					previewError={previewError}
					apkgPreview={apkgPreview}
				/>
			) : (
				<CsvPreview sampleCards={sampleCards} totalCards={totalCards} />
			)}

			{!hasRichPreview && duplicateCount > 0 && (
				<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
					<div className="flex items-start gap-2">
						<AlertTriangle className="mt-0.5 size-4 text-amber-500" />
						<div>
							<p className="text-sm font-medium text-amber-600 dark:text-amber-400">
								{duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"}{" "}
								detected
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Duplicate cards will be skipped during import.
							</p>
						</div>
					</div>
				</div>
			)}

			{apkgPreview?.mergeStats && apkgPreview.mergeStats.updatedNotes > 0 && (
				<div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
					<Info className="mt-0.5 size-4 text-blue-500" />
					<p className="text-sm text-blue-600 dark:text-blue-400">
						{apkgPreview.mergeStats.updatedNotes} note
						{apkgPreview.mergeStats.updatedNotes === 1 ? " has" : "s have"}{" "}
						changed and will be updated.
					</p>
				</div>
			)}
		</div>
	);
}
