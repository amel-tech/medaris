import type { IMuderris } from "../../../src/course/course.repository.interface";
import {
  boundAccountIds,
  boundAccountsAfterSave,
  duplicateUserId,
  imamOfNewCourse,
  muderrisListChanged,
  newlyLinkedUserIds,
} from "../../../src/course/domain/muderris-list";
import { CourseImamNotListedError } from "../../../src/course/errors/course-imam-not-listed.error";
import { MuderrisListInvalidError } from "../../../src/course/errors/muderris-list-invalid.error";

const COURSE = "c0000000-0000-4000-8000-000000000001";
const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";

const stored: IMuderris[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    courseId: COURSE,
    userId: A,
    name: "Musa Müderris",
    title: "Sarf Müderrisi",
    bio: null,
    avatarHue: 145,
    orderIndex: 0,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    courseId: COURSE,
    userId: null,
    name: "Ahmed Hilmi",
    title: null,
    bio: null,
    avatarHue: 220,
    orderIndex: 1,
  },
];

/** What nizam's editor sends for an untouched list: id, name, title if any. */
const asSent = () =>
  stored.map((m) => ({
    id: m.id,
    ...(m.userId ? { userId: m.userId } : {}),
    name: m.name,
    ...(m.title ? { title: m.title } : {}),
  }));

describe("muderrisListChanged (MDRS-105)", () => {
  it("is false for the list as stored, and for fields the save leaves out", () => {
    expect(muderrisListChanged(stored, asSent())).toBe(false);
    expect(
      muderrisListChanged(
        stored,
        stored.map((m) => ({ id: m.id, name: m.name }))
      )
    ).toBe(false);
  });

  it("is false when only the case of an id differs", () => {
    expect(
      muderrisListChanged(
        stored,
        asSent().map((m) => ({
          ...m,
          id: m.id.toUpperCase(),
          ...(m.userId ? { userId: m.userId.toUpperCase() } : {}),
        }))
      )
    ).toBe(false);
  });

  it.each([
    ["a row added", () => [...asSent(), { name: "Yeni" }]],
    ["a row dropped", () => asSent().slice(1)],
    ["the order swapped", () => asSent().reverse()],
    [
      "a row sent without its id",
      () => [{ ...asSent()[0], id: undefined }, asSent()[1]],
    ],
    [
      "an id that is not this course's",
      () => [
        { ...asSent()[0], id: "20000000-0000-4000-8000-000000000009" },
        asSent()[1],
      ],
    ],
    ["a name edited", () => [{ ...asSent()[0], name: "Başka" }, asSent()[1]]],
    ["a title edited", () => [{ ...asSent()[0], title: "Nahiv" }, asSent()[1]]],
    ["a hue edited", () => [{ ...asSent()[0], avatarHue: 10 }, asSent()[1]]],
    ["an account linked", () => [asSent()[0], { ...asSent()[1], userId: B }]],
    ["an account swapped", () => [{ ...asSent()[0], userId: B }, asSent()[1]]],
  ])("is true for %s", (_what, next) => {
    expect(muderrisListChanged(stored, next())).toBe(true);
  });

  it("is true for an emptied list and false for an empty one left empty", () => {
    expect(muderrisListChanged(stored, [])).toBe(true);
    expect(muderrisListChanged([], [])).toBe(false);
  });
});

describe("newlyLinkedUserIds", () => {
  it("leaves out accounts the course already links, lowercases and dedupes", () => {
    expect(
      newlyLinkedUserIds(stored, [
        ...asSent(),
        { name: "B", userId: B.toUpperCase() },
        { name: "B again", userId: B },
        { name: "A again", userId: A.toUpperCase() },
      ])
    ).toEqual([B]);
  });

  it("is everything on a new course", () => {
    expect(
      newlyLinkedUserIds([], [{ name: "A", userId: A }, { name: "x" }])
    ).toEqual([A]);
  });
});

describe("duplicateUserId", () => {
  it("finds an account listed twice, whatever its case", () => {
    expect(
      duplicateUserId([
        { name: "A", userId: A },
        { name: "x" },
        { name: "y" },
        { name: "A", userId: A.toUpperCase() },
      ])
    ).toBe(A);
  });

  it("ignores name-only rows", () => {
    expect(
      duplicateUserId([{ name: "x" }, { name: "x" }, { name: "A", userId: A }])
    ).toBeNull();
  });
});

describe("boundAccountIds", () => {
  it("lists each account once, lowercased, in list order, and leaves name-only rows out", () => {
    expect(
      boundAccountIds([
        { userId: B.toUpperCase() },
        { userId: null },
        { userId: A },
        { userId: B },
        {},
      ])
    ).toEqual([B, A]);
  });
});

describe("boundAccountsAfterSave", () => {
  it("keeps the stored account of a row named by id that leaves userId out", () => {
    expect(
      boundAccountsAfterSave(stored, [{ id: stored[0].id, name: "Musa" }])
    ).toEqual([A]);
  });

  it("is empty when the saved rows name no account and no stored row that has one", () => {
    expect(
      boundAccountsAfterSave(stored, [
        { id: stored[1].id, name: "Ahmed Hilmi" },
        { name: "Yeni" },
      ])
    ).toEqual([]);
  });

  it("drops the account of a row named by id that carries userId null, which the save writes as NULL", () => {
    expect(
      boundAccountsAfterSave(stored, [
        { id: stored[0].id, userId: null, name: "Musa" },
      ])
    ).toEqual([]);
  });

  it("counts an account the payload adds", () => {
    expect(boundAccountsAfterSave([], [{ userId: B, name: "Yeni" }])).toEqual([
      B,
    ]);
  });
});

describe("imamOfNewCourse", () => {
  const rows = [
    { userId: A, name: "A" },
    { userId: B, name: "B" },
  ];

  it("is the account listed first when none is named", () => {
    expect(imamOfNewCourse(rows)).toBe(A);
    expect(imamOfNewCourse([{ name: "Misafir" }, ...rows])).toBe(A);
  });

  it("is the one named, lowercased, when it is listed", () => {
    expect(imamOfNewCourse(rows, B.toUpperCase())).toBe(B);
  });

  it("refuses an imam who is not listed", () => {
    expect(() =>
      imamOfNewCourse(rows, "c0000000-0000-4000-8000-00000000000c")
    ).toThrow(CourseImamNotListedError);
  });

  it("refuses a course with no müderris who has an account", () => {
    expect(() => imamOfNewCourse([])).toThrow(MuderrisListInvalidError);
    expect(() => imamOfNewCourse([{ name: "Misafir" }])).toThrow(
      MuderrisListInvalidError
    );
  });
});
