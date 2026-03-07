import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCardStates } from "@/lib/hooks/use-stats";

const STATE_COLORS: Record<string, string> = {
  New: "hsl(217, 91%, 60%)",
  Learning: "hsl(32, 95%, 54%)",
  Review: "hsl(142, 71%, 45%)",
  Relearning: "hsl(0, 84%, 60%)",
};

type PieEntry = {
  name: string;
  value: number;
  color: string;
};

export function CardStateChart(): React.ReactElement {
  const { data, isLoading } = useCardStates();

  const entries: PieEntry[] = data
    ? [
        { name: "New", value: data.new, color: STATE_COLORS.New },
        {
          name: "Learning",
          value: data.learning,
          color: STATE_COLORS.Learning,
        },
        { name: "Review", value: data.review, color: STATE_COLORS.Review },
        {
          name: "Relearning",
          value: data.relearning,
          color: STATE_COLORS.Relearning,
        },
      ].filter((e) => e.value > 0)
    : [];

  const total = entries.reduce((sum, e) => sum + e.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card States</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        )}
        {data && entries.length > 0 && (
          <div className="flex flex-col items-center gap-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={entries}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {entries.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4">
              {entries.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div
                    className="size-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {entry.name}:{" "}
                    <span className="font-medium text-foreground">
                      {entry.value}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {total} total {total === 1 ? "card" : "cards"}
            </p>
          </div>
        )}
        {data && entries.length === 0 && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">No cards yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
