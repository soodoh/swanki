export type ImportPhase =
	| "uploading"
	| "parsing"
	| "media"
	| "notes"
	| "cards"
	| "cleanup";

export type ImportJobStatus = {
	status: "processing" | "complete" | "error";
	phase: ImportPhase;
	progress: number; // 0-100
	detail: string;
	result?: {
		cardCount: number;
		noteCount: number;
		deckCount?: number;
		duplicatesSkipped?: number;
		notesUpdated?: number;
		mediaWarnings?: string[];
		mediaCount?: number;
	};
	error?: string;
};

const jobs = new Map<string, ImportJobStatus>();

// Clean up jobs older than 10 minutes
const JOB_TTL_MS = 10 * 60 * 1000;
const jobTimestamps = new Map<string, number>();

export function createJob(): string {
	const jobId = crypto.randomUUID();
	jobs.set(jobId, {
		status: "processing",
		phase: "parsing",
		progress: 0,
		detail: "Starting import...",
	});
	jobTimestamps.set(jobId, Date.now());
	cleanupOldJobs();
	return jobId;
}

export function updateJob(
	jobId: string,
	update: Partial<ImportJobStatus>,
): void {
	const existing = jobs.get(jobId);
	if (existing) {
		jobs.set(jobId, { ...existing, ...update });
	}
}

export function getJob(jobId: string): ImportJobStatus | undefined {
	return jobs.get(jobId);
}

function cleanupOldJobs(): void {
	const now = Date.now();
	for (const [id, timestamp] of jobTimestamps) {
		if (now - timestamp > JOB_TTL_MS) {
			jobs.delete(id);
			jobTimestamps.delete(id);
		}
	}
}
