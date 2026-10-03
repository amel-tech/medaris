import { FlashcardProgressStatus } from "../../../src/flashcard/domain/flashcard-progress-status.enum";
import { ReviewRating } from "../../../src/flashcard/domain/review-rating.enum";
import {
  MAX_INTERVAL_DAYS,
  scheduleReview,
} from "../../../src/flashcard/domain/review-schedule";

const NOW = new Date("2026-10-02T09:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("scheduleReview (MDRS-165)", () => {
  it("brings a hard card back tomorrow whatever the last gap was", () => {
    expect(scheduleReview(ReviewRating.HARD, 40, NOW)).toEqual({
      status: FlashcardProgressStatus.LEARNING,
      intervalDays: 1,
      dueAt: days(1),
    });
  });

  it("keeps a medium card learning, with at least three days", () => {
    expect(scheduleReview(ReviewRating.MEDIUM, 0, NOW)).toMatchObject({
      status: FlashcardProgressStatus.LEARNING,
      intervalDays: 3,
    });
    expect(scheduleReview(ReviewRating.MEDIUM, 10, NOW).intervalDays).toBe(10);
  });

  it("masters an easy card and doubles the gap, at least a week", () => {
    expect(scheduleReview(ReviewRating.EASY, 0, NOW)).toEqual({
      status: FlashcardProgressStatus.MASTERED,
      intervalDays: 7,
      dueAt: days(7),
    });
    expect(scheduleReview(ReviewRating.EASY, 7, NOW).intervalDays).toBe(14);
  });

  it("never leaves a card alone for longer than the cap", () => {
    expect(scheduleReview(ReviewRating.EASY, 170, NOW).intervalDays).toBe(
      MAX_INTERVAL_DAYS
    );
  });

  it("treats a negative last gap as none", () => {
    expect(scheduleReview(ReviewRating.EASY, -5, NOW).intervalDays).toBe(7);
  });
});
