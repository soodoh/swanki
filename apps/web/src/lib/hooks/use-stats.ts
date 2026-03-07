import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

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
  return useQuery<ReviewsPerDay[]>({
    queryKey: ["stats", "reviews", days],
    queryFn: async () => {
      const res = await fetch(`/api/stats?type=reviews&days=${days}`);
      if (!res.ok) {
        throw new Error("Failed to fetch reviews per day");
      }
      return res.json() as Promise<ReviewsPerDay[]>;
    },
  });
}

export function useCardStates(): UseQueryResult<CardStates> {
  return useQuery<CardStates>({
    queryKey: ["stats", "states"],
    queryFn: async () => {
      const res = await fetch("/api/stats?type=states");
      if (!res.ok) {
        throw new Error("Failed to fetch card states");
      }
      return res.json() as Promise<CardStates>;
    },
  });
}

export function useStreak(): UseQueryResult<Streak> {
  return useQuery<Streak>({
    queryKey: ["stats", "streak"],
    queryFn: async () => {
      const res = await fetch("/api/stats?type=streak");
      if (!res.ok) {
        throw new Error("Failed to fetch streak");
      }
      return res.json() as Promise<Streak>;
    },
  });
}

export function useHeatmap(year: number): UseQueryResult<Heatmap> {
  return useQuery<Heatmap>({
    queryKey: ["stats", "heatmap", year],
    queryFn: async () => {
      const res = await fetch(`/api/stats?type=heatmap&year=${year}`);
      if (!res.ok) {
        throw new Error("Failed to fetch heatmap");
      }
      return res.json() as Promise<Heatmap>;
    },
  });
}
