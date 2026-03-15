import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ReviewChart } from "@/components/stats/review-chart";
import { CardStateChart } from "@/components/stats/card-state-chart";
import { ReviewHeatmap } from "@/components/stats/heatmap";
import { StreakDisplay } from "@/components/stats/streak-display";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/stats")({
  component: StatsPage,
});

type Period = {
  label: string;
  days: number;
};

const PERIODS: Period[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "Year", days: 365 },
];

export function StatsPage(): React.ReactElement {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(PERIODS[1]);
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">Statistics</h1>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {PERIODS.map((period) => (
              <Button
                key={period.days}
                variant={
                  selectedPeriod.days === period.days ? "default" : "ghost"
                }
                size="sm"
                onClick={() => setSelectedPeriod(period)}
              >
                {period.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-6">
          {/* Streak */}
          <StreakDisplay />

          {/* Reviews per day chart */}
          <ReviewChart days={selectedPeriod.days} />

          {/* Card states and heatmap side by side on larger screens */}
          <div className="grid gap-6 lg:grid-cols-2">
            <CardStateChart />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHeatmapYear((y) => y - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm font-medium">{heatmapYear}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHeatmapYear((y) => y + 1)}
                  disabled={heatmapYear >= new Date().getFullYear()}
                >
                  Next
                </Button>
              </div>
              <ReviewHeatmap year={heatmapYear} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
