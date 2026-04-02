import type { IntervalPreview } from "@/lib/hooks/use-study";
import { cn } from "@/lib/utils";

type RatingButtonsProps = {
	previews: Record<number, IntervalPreview> | undefined;
	disabled: boolean;
	onRate: (rating: number) => void;
};

const ratings = [
	{
		value: 1,
		label: "Again",
		color:
			"bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25 border-red-500/20",
		key: "1",
	},
	{
		value: 2,
		label: "Hard",
		color:
			"bg-orange-500/15 text-orange-700 dark:text-orange-400 hover:bg-orange-500/25 border-orange-500/20",
		key: "2",
	},
	{
		value: 3,
		label: "Good",
		color:
			"bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/25 border-green-500/20",
		key: "3",
	},
	{
		value: 4,
		label: "Easy",
		color:
			"bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-500/25 border-blue-500/20",
		key: "4",
	},
] as const;

function formatInterval(scheduledDays: number): string {
	if (scheduledDays < 1) {
		const minutes = Math.round(scheduledDays * 24 * 60);
		if (minutes < 60) {
			return `${minutes}m`;
		}
		return `${Math.round(minutes / 60)}h`;
	}
	if (scheduledDays < 30) {
		return `${Math.round(scheduledDays)}d`;
	}
	if (scheduledDays < 365) {
		return `${Math.round(scheduledDays / 30)}mo`;
	}
	return `${(scheduledDays / 365).toFixed(1)}y`;
}

export function RatingButtons({
	previews,
	disabled,
	onRate,
}: RatingButtonsProps): React.ReactElement {
	return (
		<div className="flex items-center justify-center gap-2 w-full max-w-2xl">
			{ratings.map((rating) => {
				const preview = previews?.[rating.value];
				const interval = preview ? formatInterval(preview.scheduledDays) : "";

				return (
					<button
						key={rating.value}
						type="button"
						disabled={disabled}
						onClick={() => onRate(rating.value)}
						className={cn(
							"flex-1 flex flex-col items-center justify-center rounded-xl border px-3 py-2",
							"text-sm font-medium transition-all",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:opacity-40 disabled:pointer-events-none",
							rating.color,
						)}
					>
						<span>
							{rating.label} <span className="opacity-50">({rating.key})</span>
						</span>
						{interval && <span className="text-xs opacity-70">{interval}</span>}
					</button>
				);
			})}
		</div>
	);
}
