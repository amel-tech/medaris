import {
  mapWithConcurrency,
  normalizeEmails,
} from "../../../src/course/domain/bulk-enrollment";

/**
 * "Toplu talebe ekle" (owner, 2026-10-12): how the list is read before any
 * address is looked up, and how the lookups are paced. The route itself is in
 * test/e2e/bulk-enrollment.e2e.spec.ts.
 */
describe("normalizeEmails", () => {
  it("trims and lower-cases each entry, and drops empty ones and repeats, first occurrence first", () => {
    expect(
      normalizeEmails([
        "  Ayse@Example.com ",
        "",
        "   ",
        "yusuf@example.com",
        "AYSE@example.COM",
        "yusuf@example.com",
      ])
    ).toEqual({
      emails: ["ayse@example.com", "yusuf@example.com"],
      invalid: [],
    });
  });

  it("puts what does not look like an address in invalid, once, and never among the ones looked up", () => {
    expect(
      normalizeEmails([
        "ayse",
        "ayse@",
        "@example.com",
        "ayse@example",
        "iki kelime@example.com",
        "Ayse",
        "zeynep@example.com",
      ])
    ).toEqual({
      emails: ["zeynep@example.com"],
      invalid: [
        "ayse",
        "ayse@",
        "@example.com",
        "ayse@example",
        "iki kelime@example.com",
      ],
    });
  });

  it("refuses an address longer than the lookup takes", () => {
    const long = `${"a".repeat(64)}@${`${"b".repeat(60)}.`.repeat(5)}com`;
    expect(long.length).toBeGreaterThan(320);
    expect(normalizeEmails([long])).toEqual({ emails: [], invalid: [long] });
  });
});

describe("mapWithConcurrency", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

  it("keeps the order of the items and never has more than the limit in flight", async () => {
    let inFlight = 0;
    let most = 0;
    const out = await mapWithConcurrency(
      Array.from({ length: 23 }, (_, i) => i),
      5,
      async (n) => {
        inFlight++;
        most = Math.max(most, inFlight);
        await tick();
        inFlight--;
        return n * 2;
      }
    );
    expect(out).toEqual(Array.from({ length: 23 }, (_, i) => i * 2));
    expect(most).toBe(5);
  });

  it("answers an empty list with an empty one", async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([]);
  });

  it("fails as a whole on the first failure, and starts nothing after it", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency(
        Array.from({ length: 20 }, (_, i) => i),
        2,
        async (n) => {
          started.push(n);
          await tick();
          if (n === 3) throw new Error("realm down");
          return n;
        }
      )
    ).rejects.toThrow("realm down");
    expect(started.length).toBeLessThan(20);
  });
});
