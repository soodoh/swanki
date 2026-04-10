import { File, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ACCEPTED_EXTENSIONS = [".apkg", ".colpkg", ".csv", ".txt", ".zip"];
const ACCEPT_STRING = ACCEPTED_EXTENSIONS.join(",");

const FORMAT_LABELS: Record<string, string> = {
	apkg: "Anki Package",
	colpkg: "Anki Collection",
	csv: "CSV",
	txt: "Tab-Separated Text",
	zip: "CrowdAnki ZIP",
};

function detectFormat(
	filename: string,
): { format: string; label: string } | undefined {
	const lower = filename.toLowerCase();
	const dotIndex = lower.lastIndexOf(".");
	if (dotIndex === -1) {
		return undefined;
	}

	const ext = lower.slice(dotIndex + 1);
	const label = FORMAT_LABELS[ext];
	if (!label) {
		return undefined;
	}

	return { format: ext, label };
}

type UploadStepProps = {
	file: File | undefined;
	onFileSelect: (file: File | undefined) => void;
	detectedFormat: string | undefined;
	onFormatDetected: (format: string | undefined) => void;
};

export function UploadStep({
	file,
	onFileSelect,
	detectedFormat: _detectedFormat,
	onFormatDetected,
}: UploadStepProps): React.ReactElement {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	const processFile = useCallback(
		(selectedFile: File) => {
			const detected = detectFormat(selectedFile.name);
			if (!detected) {
				return;
			}
			onFileSelect(selectedFile);
			onFormatDetected(detected.format);
		},
		[onFileSelect, onFormatDetected],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);

			const droppedFile = e.dataTransfer.files[0];
			if (droppedFile) {
				processFile(droppedFile);
			}
		},
		[processFile],
	);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const selectedFile = e.target.files?.[0];
			if (selectedFile) {
				processFile(selectedFile);
			}
		},
		[processFile],
	);

	const handleClear = useCallback(() => {
		onFileSelect(undefined);
		onFormatDetected(undefined);
		if (inputRef.current) {
			inputRef.current.value = "";
		}
	}, [onFileSelect, onFormatDetected]);

	const formatInfo = file ? detectFormat(file.name) : undefined;

	return (
		<div className="space-y-6">
			{/* Drop zone */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone with nested interactive children cannot be a semantic button */}
			<div
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
					isDragging
						? "border-primary bg-primary/5"
						: "border-border hover:border-muted-foreground/50"
				}`}
			>
				<Upload
					className={`size-10 ${isDragging ? "text-primary" : "text-muted-foreground"}`}
				/>
				<p className="mt-4 text-sm font-medium">Drag and drop your file here</p>
				<p className="mt-1 text-xs text-muted-foreground">
					or click the button below to browse
				</p>
				<Button
					variant="outline"
					size="sm"
					className="mt-4"
					onClick={() => inputRef.current?.click()}
				>
					Choose File
				</Button>
				<input
					ref={inputRef}
					type="file"
					accept={ACCEPT_STRING}
					onChange={handleFileChange}
					aria-label="Import file"
					className="hidden"
				/>
				<p className="mt-3 text-[10px] text-muted-foreground">
					Supported: .apkg, .colpkg, .csv, .txt, .zip
				</p>
			</div>

			{/* Selected file info */}
			{file && (
				<div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
					<File className="size-5 text-muted-foreground" />
					<div className="flex-1 min-w-0">
						<p className="truncate text-sm font-medium">{file.name}</p>
						<p className="text-xs text-muted-foreground">
							{(file.size / 1024).toFixed(1)} KB
						</p>
					</div>
					{formatInfo && <Badge variant="secondary">{formatInfo.label}</Badge>}
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={handleClear}
						aria-label="Clear selected file"
					>
						<X className="size-3.5" />
					</Button>
				</div>
			)}
		</div>
	);
}
