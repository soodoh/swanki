import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHeatmap } from "@/lib/hooks/use-stats";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type HeatmapProps = {
  year: number;
};

type DayCell = {
  date: string;
  count: number;
  weekIndex: number;
  dayOfWeek: number;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function getIntensityClass(count: number, maxCount: number): string {
  if (count === 0) {
    return "bg-muted";
  }
  const ratio = count / maxCount;
  if (ratio <= 0.25) {
    return "bg-green-200 dark:bg-green-900";
  }
  if (ratio <= 0.5) {
    return "bg-green-400 dark:bg-green-700";
  }
  if (ratio <= 0.75) {
    return "bg-green-500 dark:bg-green-500";
  }
  return "bg-green-600 dark:bg-green-400";
}

function buildGrid(
  year: number,
  data: Record<string, number>,
): {
  cells: DayCell[];
  weeks: number;
  monthStarts: { month: number; weekIndex: number }[];
} {
  const cells: DayCell[] = [];

  const start = new Date(`${year}-01-01T00:00:00`);
  const end = new Date(`${year}-12-31T00:00:00`);

  // Adjust start to previous Sunday
  const startDay = start.getDay(); // 0 = Sunday
  const adjustedStart = new Date(start);
  adjustedStart.setDate(adjustedStart.getDate() - startDay);

  const current = new Date(adjustedStart);
  let weekIndex = 0;

  const monthStarts: { month: number; weekIndex: number }[] = [];
  let lastMonth = -1;

  while (current <= end || current.getDay() !== 0) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split("T")[0];
    const isInYear = current.getFullYear() === year;

    if (isInYear && current.getMonth() !== lastMonth) {
      lastMonth = current.getMonth();
      monthStarts.push({ month: lastMonth, weekIndex });
    }

    cells.push({
      date: dateStr,
      count: isInYear ? (data[dateStr] ?? 0) : 0,
      weekIndex,
      dayOfWeek,
    });

    current.setDate(current.getDate() + 1);
    if (current.getDay() === 0) {
      weekIndex += 1;
    }

    // Safety: stop after going past the year
    if (current.getFullYear() > year && current.getDay() === 0) {
      break;
    }
  }

  return { cells, weeks: weekIndex, monthStarts };
}

export function ReviewHeatmap({ year }: HeatmapProps): React.ReactElement {
  const { data, isLoading } = useHeatmap(year);

  const { cells, monthStarts } = useMemo(
    () => buildGrid(year, data ?? {}),
    [year, data],
  );

  const maxCount = useMemo(() => {
    if (!data) return 1;
    const values = Object.values(data);
    return values.length > 0 ? Math.max(...values) : 1;
  }, [data]);

  // Group cells by week
  const weeks = useMemo(() => {
    const map = new Map<number, DayCell[]>();
    for (const cell of cells) {
      if (!map.has(cell.weekIndex)) {
        map.set(cell.weekIndex, []);
      }
      map.get(cell.weekIndex)!.push(cell);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [cells]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Activity ({year})</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        )}
        {data && (
          <div className="overflow-x-auto">
            <TooltipProvider delayDuration={100}>
              <div className="inline-flex gap-px">
                {/* Day labels */}
                <div className="mr-1 flex flex-col gap-px pt-4">
                  {DAY_LABELS.map((label, i) => (
                    <div
                      key={i}
                      className="flex h-[13px] w-6 items-center text-[10px] text-muted-foreground"
                    >
                      {label}
                    </div>
                  ))}
                </div>

                {/* Weeks */}
                <div className="flex flex-col gap-px">
                  {/* Month labels */}
                  <div className="relative mb-px flex h-3">
                    {monthStarts.map(({ month, weekIndex }) => (
                      <span
                        key={month}
                        className="absolute text-[10px] text-muted-foreground"
                        style={{ left: `${weekIndex * 14}px` }}
                      >
                        {MONTH_LABELS[month]}
                      </span>
                    ))}
                  </div>

                  {/* Grid */}
                  <div className="flex gap-px">
                    {weeks.map(([weekIdx, weekCells]) => (
                      <div key={weekIdx} className="flex flex-col gap-px">
                        {Array.from({ length: 7 }, (_, dayOfWeek) => {
                          const cell = weekCells.find(
                            (c) => c.dayOfWeek === dayOfWeek,
                          );
                          if (!cell) {
                            return (
                              <div key={dayOfWeek} className="size-[13px]" />
                            );
                          }
                          return (
                            <Tooltip key={dayOfWeek}>
                              <TooltipTrigger>
                                <div
                                  className={`size-[13px] rounded-[2px] ${getIntensityClass(cell.count, maxCount)}`}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {cell.count}{" "}
                                  {cell.count === 1 ? "review" : "reviews"} on{" "}
                                  {cell.date}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TooltipProvider>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              <span>Less</span>
              <div className="size-[13px] rounded-[2px] bg-muted" />
              <div className="size-[13px] rounded-[2px] bg-green-200 dark:bg-green-900" />
              <div className="size-[13px] rounded-[2px] bg-green-400 dark:bg-green-700" />
              <div className="size-[13px] rounded-[2px] bg-green-500 dark:bg-green-500" />
              <div className="size-[13px] rounded-[2px] bg-green-600 dark:bg-green-400" />
              <span>More</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
