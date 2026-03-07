import { describe, it, expect, expectTypeOf } from "vitest";
import { scheduleFsrs, previewAll, Rating, State } from "../../lib/fsrs";

function makeNewCard(due?: Date) {
  return {
    due: due ?? new Date(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: undefined as Date | undefined,
  };
}

describe("FSRS Wrapper", () => {
  describe("scheduleFsrs", () => {
    it("new card rated Good transitions to Learning with reps=1 and stability>0", () => {
      const card = makeNewCard();
      const now = new Date();
      const result = scheduleFsrs(card, Rating.Good, now);

      expect(result.card.state).toBe(State.Learning);
      expect(result.card.reps).toBe(1);
      expect(result.card.stability).toBeGreaterThan(0);
      expect(result.card.lastReview).toStrictEqual(now);
      expect(result.card.due.getTime()).toBeGreaterThan(now.getTime());
    });

    it("review card rated Again increments lapses", () => {
      const now = new Date();

      // Build up a card to Review state by rating Easy (skips learning)
      const card = makeNewCard(now);
      const step1 = scheduleFsrs(card, Rating.Easy, now);
      expect(step1.card.state).toBe(State.Review);
      expect(step1.card.lapses).toBe(0);

      // Now rate Again on the review card
      const reviewTime = new Date(
        now.getTime() + step1.card.scheduledDays * 86_400_000,
      );
      const step2 = scheduleFsrs(step1.card, Rating.Again, reviewTime);

      expect(step2.card.lapses).toBe(1);
      expect(step2.card.state).toBe(State.Relearning);
      expect(step2.card.reps).toBe(2);
    });

    it("multiple sequential reviews accumulate reps", () => {
      const now = new Date();

      // First review
      const card = makeNewCard(now);
      const step1 = scheduleFsrs(card, Rating.Good, now);
      expect(step1.card.reps).toBe(1);

      // Second review (10 minutes later)
      const time2 = new Date(now.getTime() + 600_000);
      const step2 = scheduleFsrs(step1.card, Rating.Good, time2);
      expect(step2.card.reps).toBe(2);

      // Third review (scheduled days later)
      const time3 = new Date(
        time2.getTime() + step2.card.scheduledDays * 86_400_000,
      );
      const step3 = scheduleFsrs(step2.card, Rating.Good, time3);
      expect(step3.card.reps).toBe(3);
    });

    it("returns log with pre-review state info", () => {
      const card = makeNewCard();
      const now = new Date();
      const result = scheduleFsrs(card, Rating.Good, now);

      // Log captures the state BEFORE the review
      expect(result.log.state).toBe(State.New);
      expect(result.log.rating).toBe(Rating.Good);
      expect(result.log.stability).toBe(0);
      expect(result.log.difficulty).toBe(0);
    });
  });

  describe("previewAll", () => {
    it("returns interval previews for all 4 ratings", () => {
      const card = makeNewCard();
      const now = new Date();
      const previews = previewAll(card, now);

      // Should have entries for Again(1), Hard(2), Good(3), Easy(4)
      expect(previews[Rating.Again]).toBeDefined();
      expect(previews[Rating.Hard]).toBeDefined();
      expect(previews[Rating.Good]).toBeDefined();
      expect(previews[Rating.Easy]).toBeDefined();
    });

    it("each preview has due date, stability, difficulty, state", () => {
      const card = makeNewCard();
      const now = new Date();
      const previews = previewAll(card, now);

      for (const rating of [
        Rating.Again,
        Rating.Hard,
        Rating.Good,
        Rating.Easy,
      ]) {
        const preview = previews[rating];
        expect(preview.rating).toBe(rating);
        expect(preview.due).toBeInstanceOf(Date);
        expectTypeOf(preview.stability).toBeNumber();
        expectTypeOf(preview.difficulty).toBeNumber();
        expectTypeOf(preview.state).toBeNumber();
        expectTypeOf(preview.scheduledDays).toBeNumber();
      }
    });

    it("Easy rating produces the longest interval for a new card", () => {
      const card = makeNewCard();
      const now = new Date();
      const previews = previewAll(card, now);

      // Easy should have a further due date than Again
      expect(previews[Rating.Easy].due.getTime()).toBeGreaterThan(
        previews[Rating.Again].due.getTime(),
      );
    });

    it("Easy rating on new card goes directly to Review state", () => {
      const card = makeNewCard();
      const now = new Date();
      const previews = previewAll(card, now);

      expect(previews[Rating.Easy].state).toBe(State.Review);
    });
  });
});
