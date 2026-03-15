import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useTransport } from "@swanki/core/transport";

export type ReviewsPerDay = {
  date: string;
  count: number;
};

export type CardStates = {
  new: number;
  learning: number;
  review: number;
  relearning: number;
};

export type Streak = {
  current: number;
  longest: number;
};

export type Heatmap = Record<string, number>;

export function useReviewsPerDay(
  days: number,
): UseQueryResult<ReviewsPerDay[]> {
  const transport = useTransport();

  return useQuery<ReviewsPerDay[]>({
    queryKey: ["stats", "reviews", days],
    queryFn: () =>
      transport.query<ReviewsPerDay[]>("/api/stats", {
        type: "reviews",
        days: String(days),
      }),
  });
}

export function useCardStates(): UseQueryResult<CardStates> {
  const transport = useTransport();

  return useQuery<CardStates>({
    queryKey: ["stats", "states"],
    queryFn: () =>
      transport.query<CardStates>("/api/stats", { type: "states" }),
  });
}

export function useStreak(): UseQueryResult<Streak> {
  const transport = useTransport();

  return useQuery<Streak>({
    queryKey: ["stats", "streak"],
    queryFn: () => transport.query<Streak>("/api/stats", { type: "streak" }),
  });
}

export function useHeatmap(year: number): UseQueryResult<Heatmap> {
  const transport = useTransport();

  return useQuery<Heatmap>({
    queryKey: ["stats", "heatmap", year],
    queryFn: () =>
      transport.query<Heatmap>("/api/stats", {
        type: "heatmap",
        year: String(year),
      }),
  });
}
