import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useOffline } from "@/lib/offline/offline-provider";
import { offlineQuery } from "@/lib/offline/offline-fetch";
import * as localQueries from "@/lib/offline/local-queries";

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
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<ReviewsPerDay[]>({
    queryKey: ["stats", "reviews", days],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch(`/api/stats?type=reviews&days=${days}`);
          if (!res.ok) {
            throw new Error("Failed to fetch reviews per day");
          }
          return res.json() as Promise<ReviewsPerDay[]>;
        },
        localQuery: (localDb) => localQueries.getReviewsPerDay(localDb, days),
        db,
        isOnline,
        isLocalReady,
      }),
  });
}

export function useCardStates(): UseQueryResult<CardStates> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<CardStates>({
    queryKey: ["stats", "states"],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch("/api/stats?type=states");
          if (!res.ok) {
            throw new Error("Failed to fetch card states");
          }
          return res.json() as Promise<CardStates>;
        },
        localQuery: (localDb) => localQueries.getCardStates(localDb),
        db,
        isOnline,
        isLocalReady,
      }),
  });
}

export function useStreak(): UseQueryResult<Streak> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<Streak>({
    queryKey: ["stats", "streak"],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch("/api/stats?type=streak");
          if (!res.ok) {
            throw new Error("Failed to fetch streak");
          }
          return res.json() as Promise<Streak>;
        },
        localQuery: (localDb) => localQueries.getStreak(localDb),
        db,
        isOnline,
        isLocalReady,
      }),
  });
}

export function useHeatmap(year: number): UseQueryResult<Heatmap> {
  const { db, isOnline, isLocalReady } = useOffline();

  return useQuery<Heatmap>({
    queryKey: ["stats", "heatmap", year],
    queryFn: async () =>
      offlineQuery({
        serverFetch: async () => {
          const res = await fetch(`/api/stats?type=heatmap&year=${year}`);
          if (!res.ok) {
            throw new Error("Failed to fetch heatmap");
          }
          return res.json() as Promise<Heatmap>;
        },
        localQuery: (localDb) => localQueries.getHeatmap(localDb, year),
        db,
        isOnline,
        isLocalReady,
      }),
  });
}
