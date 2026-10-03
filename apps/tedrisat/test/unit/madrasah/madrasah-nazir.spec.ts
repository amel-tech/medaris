import { describe, expect, it } from "vitest";
import {
  type IGivenItem,
  planDismissal,
} from "../../../src/madrasah/nazir/dismissal-plan";

/**
 * MDRS-184, nazir/15: what görevden al does with each thing the nazır handed
 * on. The route end to end is test/e2e/madrasah-nazir.e2e.spec.ts.
 */
const A = "d5000000-0000-4000-8000-0000000000aa";
const B = "d5000000-0000-4000-8000-0000000000bb";
const given: IGivenItem[] = [
  { kind: "ROLE", id: "r1", userId: A },
  { kind: "GRANT", id: "g1", userId: A },
  { kind: "ROLE", id: "r2", userId: B },
];

describe("planDismissal", () => {
  it("applies one person's decision to everything they were given", () => {
    const plan = planDismissal(given, [
      { userId: A, action: "TAKE_OVER" },
      { userId: B, action: "DROP" },
    ]);
    expect(plan?.takeOver.map((i) => i.id)).toEqual(["r1", "g1"]);
    expect(plan?.drop.map((i) => i.id)).toEqual(["r2"]);
  });

  it("reads a person's id in either case", () => {
    const plan = planDismissal(given, [
      { userId: A.toUpperCase(), action: "DROP" },
      { userId: B, action: "DROP" },
    ]);
    expect(plan?.drop).toHaveLength(3);
  });

  it("accepts an empty list when the nazır gave no one anything", () => {
    expect(planDismissal([], [])).toEqual({ takeOver: [], drop: [] });
  });

  it.each([
    ["no decision", []],
    ["a missing person", [{ userId: A, action: "DROP" as const }]],
    [
      "a person nobody was given anything by",
      [
        { userId: A, action: "DROP" as const },
        { userId: B, action: "DROP" as const },
        {
          userId: "d5000000-0000-4000-8000-0000000000cc",
          action: "DROP" as const,
        },
      ],
    ],
    [
      "a person decided twice",
      [
        { userId: A, action: "DROP" as const },
        { userId: A, action: "TAKE_OVER" as const },
        { userId: B, action: "DROP" as const },
      ],
    ],
  ])("refuses %s", (_what, decisions) => {
    expect(planDismissal(given, decisions)).toBeNull();
  });
});
