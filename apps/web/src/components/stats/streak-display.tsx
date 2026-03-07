import { Flame, Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStreak } from "@/lib/hooks/use-stats";

export function StreakDisplay(): React.ReactElement {
  const { data, isLoading } = useStreak();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Streak</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex h-24 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        )}
        {data && (
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-orange-500/10">
                <Flame className="size-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.current}</p>
                <p className="text-xs text-muted-foreground">
                  {data.current === 1 ? "day" : "days"} current
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-yellow-500/10">
                <Trophy className="size-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.longest}</p>
                <p className="text-xs text-muted-foreground">
                  {data.longest === 1 ? "day" : "days"} longest
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
