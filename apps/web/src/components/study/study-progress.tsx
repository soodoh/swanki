import type { CardCounts } from "@/lib/hooks/use-study";

type StudyProgressProps = {
	counts: CardCounts;
	initialTotal: number;
};

export function StudyProgress({
	counts,
	initialTotal,
}: StudyProgressProps): React.ReactElement {
	const remaining = counts.new + counts.learning + counts.review;
	const total = initialTotal > 0 ? initialTotal : remaining;
	const progress =
		total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;

	return (
		<div className="flex flex-col gap-2 w-full max-w-2xl">
			<div className="flex items-center justify-between text-sm">
				<div className="flex items-center gap-3">
					<span className="flex items-center gap-1">
						<span className="inline-block size-2 rounded-full bg-blue-500" />
						<span className="text-blue-700 dark:text-blue-400 tabular-nums font-medium">
							{counts.new}
						</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="inline-block size-2 rounded-full bg-orange-500" />
						<span className="text-orange-700 dark:text-orange-400 tabular-nums font-medium">
							{counts.learning}
						</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="inline-block size-2 rounded-full bg-green-500" />
						<span className="text-green-700 dark:text-green-400 tabular-nums font-medium">
							{counts.review}
						</span>
					</span>
				</div>
			</div>

			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
					style={{ width: `${String(progress)}%` }}
				/>
			</div>
		</div>
	);
}
