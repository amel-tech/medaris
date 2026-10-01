import type { IMuderris } from "../../../src/course/course.repository.interface";
import {
  duplicateUserId,
  muderrisListChanged,
  newlyLinkedUserIds,
} from "../../../src/course/domain/muderris-list";

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
