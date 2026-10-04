import {
  auditImpactOf,
  confirmationMatches,
  confirmationOf,
  type IPassivationImpact,
  PASSIVATION_COURSE_ITEMS,
  presentImpact,
} from "../../../src/passivation/passivation-impact";

const ACTOR = "a0000000-0000-4000-8000-000000000001";
const OTHER_ACTOR = "a0000000-0000-4000-8000-000000000002";
const KOSK = "b0000000-0000-4000-8000-000000000001";
const C1 = "c0000000-0000-4000-8000-000000000001";
const C2 = "c0000000-0000-4000-8000-000000000002";
const S1 = "d0000000-0000-4000-8000-000000000001";
const S2 = "d0000000-0000-4000-8000-000000000002";
const NAZIM = "e0000000-0000-4000-8000-000000000001";

const impact = (): IPassivationImpact => ({
  scope: { type: "KOSK", id: KOSK, name: "Nûruosmaniye Köşkü" },
  alreadyPassive: false,
  closesContent: true,
  staffIds: [NAZIM],
  courses: [
    {
      id: C1,
      title: "Emsile ve Bina",
      koskName: "Nûruosmaniye Köşkü",
      status: "PUBLISHED",
      liveMuderris: true,
      enrolled: 2,
      completed: 0,
    },
    {
      id: C2,
      title: "Kâfiye'ye giriş",
      koskName: "Nûruosmaniye Köşkü",
      status: "DRAFT",
      liveMuderris: false,
      enrolled: 0,
      completed: 1,
    },
  ],
  students: { enrolled: 2, completed: 1 },
  sessions: {
    windowDays: 7,
    items: [
      {
        id: S1,
        title: "Celse 1",
        courseTitle: "Emsile ve Bina",
        scheduledAt: new Date("2026-10-05T10:00:00Z"),
      },
      {
        id: S2,
        title: "Celse 2",
        courseTitle: "Emsile ve Bina",
        scheduledAt: new Date("2026-10-06T10:00:00Z"),
      },
    ],
  },
});

describe("confirmationOf (MDRS-227)", () => {
  const base = confirmationOf(impact(), ACTOR);

  it("is 64 hex characters", () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the same for the same facts in any order, and ignores names and times", () => {
    const shuffled = impact();
    shuffled.courses.reverse();
    shuffled.sessions.items.reverse();
    shuffled.staffIds = [...shuffled.staffIds].reverse();
    shuffled.scope.name = "Another name";
    shuffled.courses[0].title = "Another title";
    shuffled.sessions.items[0].scheduledAt = new Date("2030-01-01T00:00:00Z");
    expect(confirmationOf(shuffled, ACTOR)).toBe(base);
  });

  it("is the same for an upper-case id", () => {
    const upper = impact();
    upper.scope.id = KOSK.toUpperCase();
    expect(confirmationOf(upper, ACTOR.toUpperCase())).toBe(base);
  });

  const changes: Array<[string, (i: IPassivationImpact) => void]> = [
    [
      "a talebe enrols",
      (i) => {
        i.courses[0].enrolled += 1;
      },
    ],
    [
      "a talebe leaves",
      (i) => {
        i.courses[0].enrolled -= 1;
      },
    ],
    [
      "a talebe completes",
      (i) => {
        i.courses[1].completed += 1;
      },
    ],
    [
      "a müderris leaves",
      (i) => {
        i.courses[0].liveMuderris = false;
      },
    ],
    [
      "a müderris appears",
      (i) => {
        i.courses[1].liveMuderris = true;
      },
    ],
    [
      "a draft is published",
      (i) => {
        i.courses[1].status = "PUBLISHED";
      },
    ],
    ["a course is added", (i) => void i.courses.pop()],
    [
      "a session is scheduled",
      (i) =>
        void i.sessions.items.push({
          id: "d0000000-0000-4000-8000-000000000003",
          title: "x",
          courseTitle: "y",
          scheduledAt: new Date(),
        }),
    ],
    ["a session is cancelled", (i) => void i.sessions.items.pop()],
    ["a nazım is added", (i) => void i.staffIds.push(OTHER_ACTOR)],
    [
      "the nazım leaves",
      (i) => {
        i.staffIds = [];
      },
    ],
    [
      "closesContent flips",
      (i) => {
        i.closesContent = false;
      },
    ],
    [
      "the distinct talebe change",
      (i) => {
        i.students.enrolled += 1;
      },
    ],
    [
      "the window changes",
      (i) => {
        i.sessions.windowDays = 14;
      },
    ],
    [
      "the scope is another",
      (i) => {
        i.scope.id = "b0000000-0000-4000-8000-000000000002";
      },
    ],
    [
      "the scope is a medrese",
      (i) => {
        i.scope.type = "MADRASAH";
      },
    ],
  ];
  it.each(changes)("differs when %s", (_name, change) => {
    const changed = impact();
    change(changed);
    expect(confirmationOf(changed, ACTOR)).not.toBe(base);
  });

  it("differs for another caller", () => {
    expect(confirmationOf(impact(), OTHER_ACTOR)).not.toBe(base);
  });
});

describe("confirmationMatches", () => {
  it("accepts the token of these facts and this caller", () => {
    expect(
      confirmationMatches(impact(), ACTOR, confirmationOf(impact(), ACTOR))
    ).toBe(true);
  });

  it("refuses a short, a long, an empty and a foreign token without throwing", () => {
    const token = confirmationOf(impact(), ACTOR);
    expect(confirmationMatches(impact(), ACTOR, token.slice(0, 10))).toBe(
      false
    );
    expect(confirmationMatches(impact(), ACTOR, `${token}0`)).toBe(false);
    expect(confirmationMatches(impact(), ACTOR, "")).toBe(false);
    expect(
      confirmationMatches(
        impact(),
        ACTOR,
        confirmationOf(impact(), OTHER_ACTOR)
      )
    ).toBe(false);
  });
});

describe("presentImpact", () => {
  it("counts from the full set and carries the token of the full set", () => {
    const response = presentImpact(impact(), ACTOR);
    expect(response).toMatchObject({
      alreadyPassive: false,
      closesContent: true,
      staffLeaving: 1,
      courses: { total: 2, published: 1, draft: 1, withLiveMuderris: 1 },
      students: { enrolled: 2, completed: 1 },
      sessions: { windowDays: 7, count: 2 },
      confirmation: confirmationOf(impact(), ACTOR),
    });
    expect(response.courses.items.map((c) => c.id)).toEqual([C1, C2]);
    expect(response.sessions.next.map((s) => s.id)).toEqual([S1, S2]);
  });

  it("caps the lists, says so, and still covers every course in the token", () => {
    const big = impact();
    big.courses = Array.from(
      { length: PASSIVATION_COURSE_ITEMS + 3 },
      (_, i) => ({
        id: `c1000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        title: `Ders ${i}`,
        koskName: "K",
        status: "PUBLISHED",
        liveMuderris: false,
        enrolled: i,
        completed: 0,
      })
    );
    const response = presentImpact(big, ACTOR);
    expect(response.courses.total).toBe(PASSIVATION_COURSE_ITEMS + 3);
    expect(response.courses.items).toHaveLength(PASSIVATION_COURSE_ITEMS);
    expect(response.courses.truncated).toBe(true);
    // The most enrolled first.
    expect(response.courses.items[0].enrolled).toBe(
      PASSIVATION_COURSE_ITEMS + 2
    );
    const withoutLast = { ...big, courses: big.courses.slice(0, -1) };
    expect(confirmationOf(withoutLast, ACTOR)).not.toBe(response.confirmation);
  });
});

describe("auditImpactOf", () => {
  it("keeps the numbers and the course ids, not names", () => {
    expect(auditImpactOf(impact())).toEqual({
      courses: 2,
      withLiveMuderris: 1,
      enrolled: 2,
      completed: 1,
      closesContent: true,
      sessions: { windowDays: 7, count: 2 },
      courseIds: [C1, C2],
    });
  });
});
