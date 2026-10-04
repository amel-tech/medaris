import {
  changesSessions,
  type IPayloadWeek,
  type IStoredWeek,
  sessionChanges,
} from "../../../src/course/domain/session-changes";

const W1 = "10000000-0000-4000-8000-000000000001";
const W2 = "10000000-0000-4000-8000-000000000002";
const L1 = "20000000-0000-4000-8000-000000000001";
const L2 = "20000000-0000-4000-8000-000000000002";
const L3 = "20000000-0000-4000-8000-000000000003";

const T1 = new Date("2026-10-05T17:00:00.000Z");
const T2 = new Date("2026-10-12T17:00:00.000Z");

const stored = (): IStoredWeek[] => [
  {
    id: W1,
    lessons: [
      { id: L1, scheduledAt: T1 },
      { id: L2, scheduledAt: null },
    ],
  },
  { id: W2, lessons: [{ id: L3, scheduledAt: T2 }] },
];

/** What an editor sends back for the stored course, nothing touched. */
const untouched = (): IPayloadWeek[] => [
  {
    id: W1,
    lessons: [{ id: L1, scheduledAt: T1 }, { id: L2 }],
  },
  { id: W2, lessons: [{ id: L3, scheduledAt: T2 }] },
];

describe("sessionChanges (MDRS-247)", () => {
  it("finds nothing in a save that leaves every session where it is", () => {
    expect(sessionChanges(stored(), untouched())).toEqual({
      added: 0,
      moved: 0,
      hidden: 0,
    });
    expect(changesSessions(sessionChanges(stored(), untouched()))).toBe(false);
  });

  it("reads an instant sent as a new Date of the same time as unchanged", () => {
    const payload = untouched();
    payload[0].lessons = [
      { id: L1, scheduledAt: new Date(T1.getTime()) },
      { id: L2, scheduledAt: null },
    ];
    expect(changesSessions(sessionChanges(stored(), payload))).toBe(false);
  });

  it("reads a session sent without a time as keeping the stored one", () => {
    const payload = untouched();
    payload[0].lessons = [{ id: L1 }, { id: L2 }];
    expect(changesSessions(sessionChanges(stored(), payload))).toBe(false);
  });

  it("counts a lesson with no id, or an id the course does not hold, as added", () => {
    const payload = untouched();
    payload[1].lessons?.push(
      {},
      { id: "20000000-0000-4000-8000-0000000000ff" }
    );
    expect(sessionChanges(stored(), payload)).toEqual({
      added: 2,
      moved: 0,
      hidden: 0,
    });
  });

  it("counts an id sent twice as one session and one added", () => {
    const payload = untouched();
    payload[1].lessons?.push({ id: L3, scheduledAt: T2 });
    expect(sessionChanges(stored(), payload)).toMatchObject({
      added: 1,
      moved: 0,
      hidden: 0,
    });
  });

  it("counts a stored lesson the save leaves out as hidden", () => {
    const payload = untouched();
    payload[0].lessons = [{ id: L1, scheduledAt: T1 }];
    expect(sessionChanges(stored(), payload)).toEqual({
      added: 0,
      moved: 0,
      hidden: 1,
    });
  });

  it("counts a lesson in another week as moved", () => {
    const payload: IPayloadWeek[] = [
      { id: W1, lessons: [{ id: L1, scheduledAt: T1 }] },
      {
        id: W2,
        lessons: [{ id: L3, scheduledAt: T2 }, { id: L2 }],
      },
    ];
    expect(sessionChanges(stored(), payload)).toEqual({
      added: 0,
      moved: 1,
      hidden: 0,
    });
  });

  it("counts a lesson in a week the save creates as moved", () => {
    const payload: IPayloadWeek[] = [
      { id: W1, lessons: [{ id: L1, scheduledAt: T1 }] },
      { id: W2, lessons: [{ id: L3, scheduledAt: T2 }] },
      { lessons: [{ id: L2 }] },
    ];
    expect(sessionChanges(stored(), payload).moved).toBe(1);
  });

  it("counts a changed place in the week, and a changed or cleared time, as moved", () => {
    const reordered = untouched();
    reordered[0].lessons = [{ id: L2 }, { id: L1, scheduledAt: T1 }];
    expect(sessionChanges(stored(), reordered).moved).toBe(2);

    const retimed = untouched();
    retimed[1].lessons = [{ id: L3, scheduledAt: T1 }];
    expect(sessionChanges(stored(), retimed).moved).toBe(1);

    const cleared = untouched();
    cleared[1].lessons = [{ id: L3, scheduledAt: null }];
    expect(sessionChanges(stored(), cleared).moved).toBe(1);

    const timed = untouched();
    timed[0].lessons = [
      { id: L1, scheduledAt: T1 },
      { id: L2, scheduledAt: T2 },
    ];
    expect(sessionChanges(stored(), timed).moved).toBe(1);
  });

  it("does not count a reordered week, a renamed one, or a week with no sessions that is left out", () => {
    const swapped: IPayloadWeek[] = [untouched()[1], untouched()[0]];
    expect(changesSessions(sessionChanges(stored(), swapped))).toBe(false);

    const withEmpty = [
      ...stored(),
      { id: "10000000-0000-4000-8000-000000000003", lessons: [] },
    ];
    expect(changesSessions(sessionChanges(withEmpty, untouched()))).toBe(false);
  });

  it("treats a week id sent twice as one week and a new one", () => {
    const payload: IPayloadWeek[] = [
      { id: W1, lessons: [{ id: L1, scheduledAt: T1 }, { id: L2 }] },
      { id: W1, lessons: [{ id: L3, scheduledAt: T2 }] },
    ];
    // L3 sits in the second W1, which is written as a new week.
    expect(sessionChanges(stored(), payload).moved).toBe(1);
  });

  it("reads a save with no weeks as hiding every session", () => {
    expect(sessionChanges(stored(), [])).toEqual({
      added: 0,
      moved: 0,
      hidden: 3,
    });
  });
});
