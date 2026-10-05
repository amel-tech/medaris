import { describe, expect, it } from "vitest";
import {
  byName,
  enrolmentErrorKey,
  listsOf,
  matching,
  removedRows,
  rosterActions,
  seatMoved,
  studentsHref,
} from "~/features/enrolments/enrolments";
import { translatorFor } from "./server-render";

/** Talebeler of a course as rules: the lists, the rows, the search and the sentences of a refusal. */

const t = translatorFor("nazar");
const where = {
  locale: "tr",
  timeZone: "Europe/Istanbul",
  now: new Date("2026-10-02T12:00:00+03:00"),
};

const item = (
  n: number,
  status: string,
  over: Record<string, unknown> = {}
) => ({
  userId: `u-${n}`,
  courseId: "c-1",
  studentName: `Talebe ${n}`,
  studentEmail: `talebe.${n}@example.com`,
  progress: 40,
  status,
  createdAt: new Date(`2026-09-${10 + n}T10:00:00+03:00`),
  updatedAt: new Date("2026-09-30T10:00:00+03:00"),
  ban: null,
  ...over,
});

describe("the course's enrolments", () => {
  const lists = listsOf(
    [
      item(1, "PENDING"),
      item(2, "ENROLLED", { progress: 75 }),
      item(3, "COMPLETED", { progress: 100 }),
      item(4, "REVOKED"),
      item(5, "PENDING", { studentName: null }),
      item(6, "PENDING", { studentName: "  ", studentEmail: null }),
    ] as never,
    t,
    where
  );

  it("are told apart by state, and a revoked seat is on none of the lists", () => {
    expect(lists.applications.map((r) => r.userId).sort()).toEqual([
      "u-1",
      "u-5",
      "u-6",
    ]);
    expect(lists.enrolled.map((r) => r.userId)).toEqual(["u-2"]);
    expect(lists.completed.map((r) => r.userId)).toEqual(["u-3"]);
  });

  it("put the newest application first", () => {
    expect(lists.applications.map((r) => r.userId)).toEqual([
      "u-6",
      "u-5",
      "u-1",
    ]);
  });

  it("name a talebe by name, else by e-mail, else as unnamed", () => {
    const byId = Object.fromEntries(
      lists.applications.map((r) => [r.userId, r])
    );
    expect(byId["u-1"]?.name).toBe("Talebe 1");
    expect(byId["u-5"]?.name).toBe("talebe.5@example.com");
    expect(byId["u-6"]?.name).toBe("Adsız talebe");
    expect(byId["u-6"]?.email).toBeNull();
  });

  it("carry the talebe's own progress and the day of their enrolment on the viewer's calendar", () => {
    expect(lists.enrolled[0]).toMatchObject({
      progress: 75,
      joined: { label: "12 Eyl", iso: "2026-09-12T07:00:00.000Z" },
    });
  });

  it("say the year of a day that is not in the current one", () => {
    const [row] = listsOf(
      [
        item(1, "PENDING", {
          createdAt: new Date("2025-12-02T09:00:00+03:00"),
        }),
      ] as never,
      t,
      where
    ).applications;
    expect(row?.at.label).toBe("2 Ara 2025");
  });
});

describe("the removed list", () => {
  const rows = removedRows(
    [
      {
        userId: "u-1",
        name: "Sümeyye Nur",
        email: "s@example.com",
        reason: "Üç haftadır derslere katılmıyor.",
        progress: 10,
        removedAt: new Date("2026-09-30T10:00:00+03:00"),
        removedBy: { id: "u-9", name: "Yusuf Ziya" },
      },
      {
        userId: "u-1",
        name: null,
        email: null,
        reason: "Tekrar.",
        progress: 0,
        removedAt: new Date("2026-09-30T10:00:00+03:00"),
        removedBy: { id: "u-9", name: null },
      },
    ] as never,
    t,
    where
  );

  it("keeps the reason and who wrote it, dated on the viewer's calendar", () => {
    expect(rows[0]).toMatchObject({
      name: "Sümeyye Nur",
      email: "s@example.com",
      reason: "Üç haftadır derslere katılmıyor.",
      by: "Yusuf Ziya",
      at: { label: "30 Eyl" },
    });
  });

  it("names a nameless person and a nameless remover, and keys each removal on its own", () => {
    expect(rows[1]?.name).toBe("Adsız talebe");
    expect(rows[1]?.by).toBe("Adı bilinmiyor");
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
});

describe("the search", () => {
  const people = [
    { name: "İbrahim Halil", email: "ibrahim@example.com" },
    { name: "Sümeyye Nur", email: null },
    { name: "Ömer Faruk", email: "omer@example.com" },
  ];

  it("matches a name or an e-mail the way a person types it", () => {
    expect(matching(people, "ibrahim").map((p) => p.name)).toEqual([
      "İbrahim Halil",
    ]);
    expect(matching(people, "SUMEYYE").map((p) => p.name)).toEqual([
      "Sümeyye Nur",
    ]);
    expect(matching(people, "omer@").map((p) => p.name)).toEqual([
      "Ömer Faruk",
    ]);
    expect(matching(people, "kimse")).toEqual([]);
  });

  it("keeps everyone for an empty search", () => {
    expect(matching(people, "  ")).toHaveLength(3);
  });

  it("sorts by name in Turkish order, either way", () => {
    expect(byName(people, "ascending").map((p) => p.name)).toEqual([
      "İbrahim Halil",
      "Ömer Faruk",
      "Sümeyye Nur",
    ]);
    expect(byName(people, "descending").map((p) => p.name)[0]).toBe(
      "Sümeyye Nur"
    );
  });
});

describe("what a row offers", () => {
  const all = { decide: true, complete: true, remove: true };

  it("completes or removes a held seat, and only reopens a completion", () => {
    expect(rosterActions("enrolled", all)).toEqual(["complete", "remove"]);
    expect(rosterActions("completed", all)).toEqual(["reopen"]);
  });

  it("offers each button only for the permission it needs", () => {
    expect(rosterActions("enrolled", { ...all, complete: false })).toEqual([
      "remove",
    ]);
    expect(rosterActions("enrolled", { ...all, remove: false })).toEqual([
      "complete",
    ]);
    expect(rosterActions("completed", { ...all, complete: false })).toEqual([]);
    expect(
      rosterActions("enrolled", {
        decide: true,
        complete: false,
        remove: false,
      })
    ).toEqual([]);
  });
});

describe("what the API refuses", () => {
  it("words a refusal from its code", () => {
    expect(enrolmentErrorKey("AUTHZ_FORBIDDEN")).toBe(
      "Problems.actionForbidden"
    );
    expect(enrolmentErrorKey("ENROLLMENT_STATE_CONFLICT")).toBe(
      "CourseStudents.errors.gone"
    );
    expect(enrolmentErrorKey("ENROLLMENT_NOT_FOUND")).toBe(
      "CourseStudents.errors.gone"
    );
    expect(enrolmentErrorKey("SOMETHING_NEW")).toBe("Problems.actionGeneric");
  });

  it("reads the list again when the seat is no longer as shown", () => {
    expect(seatMoved("ENROLLMENT_STATE_CONFLICT")).toBe(true);
    expect(seatMoved("ENROLLMENT_NOT_FOUND")).toBe(true);
    expect(seatMoved("AUTHZ_FORBIDDEN")).toBe(false);
  });

  it("leads to the course's Talebeler", () => {
    expect(studentsHref("c-1")).toBe("/ders/c-1/talebeler");
  });
});
