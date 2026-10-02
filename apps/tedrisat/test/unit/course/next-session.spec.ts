import { nextSessionOf } from "../../../src/course/course.repository";

const NOW = new Date("2026-10-02T12:00:00Z");
const at = (iso: string) => new Date(iso);

describe("nextSessionOf (MDRS-159)", () => {
  it("is null with nothing scheduled", () => {
    expect(
      nextSessionOf(
        [
          {
            weekNumber: 1,
            lessons: [{ scheduledAt: null, cancelledAt: null }],
          },
        ],
        NOW
      )
    ).toBeNull();
    expect(nextSessionOf([], NOW)).toBeNull();
  });

  it("takes the earliest session ahead, with the number of its week", () => {
    const next = nextSessionOf(
      [
        {
          weekNumber: 5,
          lessons: [
            { scheduledAt: at("2026-10-10T18:00:00Z"), cancelledAt: null },
          ],
        },
        {
          weekNumber: 4,
          lessons: [
            { scheduledAt: at("2026-10-04T18:00:00Z"), cancelledAt: null },
            { scheduledAt: at("2026-10-20T18:00:00Z"), cancelledAt: null },
          ],
        },
      ],
      NOW
    );
    expect(next).toEqual({ at: at("2026-10-04T18:00:00Z"), weekNumber: 4 });
  });

  it("skips a session already past and a cancelled one", () => {
    const next = nextSessionOf(
      [
        {
          weekNumber: 3,
          lessons: [
            { scheduledAt: at("2026-09-30T18:00:00Z"), cancelledAt: null },
            {
              scheduledAt: at("2026-10-03T18:00:00Z"),
              cancelledAt: at("2026-10-01T09:00:00Z"),
            },
            { scheduledAt: at("2026-10-07T18:00:00Z"), cancelledAt: null },
          ],
        },
      ],
      NOW
    );
    expect(next?.at).toEqual(at("2026-10-07T18:00:00Z"));
  });
});
