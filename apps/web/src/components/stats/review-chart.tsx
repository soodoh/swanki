import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReviewsPerDay } from "@/lib/hooks/use-stats";

type ReviewChartProps = {
  days: number;
};

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ReviewChart({ days }: ReviewChartProps): React.ReactElement {
  const { data, isLoading } = useReviewsPerDay(days);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviews per Day</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        )}
        {data && data.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                interval={days <= 7 ? 0 : "preserveStartEnd"}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <Tooltip
                labelFormatter={(label: string) => formatDate(label)}
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
              <Bar
                dataKey="count"
                name="Reviews"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        {data && data.length === 0 && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">No review data yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
