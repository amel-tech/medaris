import { describe, expect, it } from "vitest";
import {
  BULK_MAX,
  bulkErrorKey,
  outcomeLines,
  parseEmailList,
  skipReasonKey,
  unmatched,
} from "~/features/enrolments/bulk";
import { translatorFor } from "./server-render";

/** "Toplu talebe ekle" as rules: how the typed list is read, and how the answer is told. */

const t = translatorFor("nazar");

const answer = (over: Record<string, unknown> = {}) => ({
  enrolled: [],
  approved: [],
  already: [],
  notFound: [],
  invalid: [],
  skipped: [],
  ...over,
});

describe("parseEmailList", () => {
  it("reads one address a line", () => {
    expect(
      parseEmailList(
        "ayse@example.com\nyusuf@example.com\r\nzeynep@example.com"
      )
    ).toEqual(["ayse@example.com", "yusuf@example.com", "zeynep@example.com"]);
  });

  it("reads addresses separated by commas or semicolons, and a mix of all three", () => {
    expect(
      parseEmailList(
        "a@example.com, b@example.com;c@example.com ;\n d@example.com"
      )
    ).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
    ]);
  });

  it("trims and lower-cases, drops empty entries and keeps each address once, first typed first", () => {
    expect(
      parseEmailList(
        "  Ayse@Example.com \n\n,;, \nyusuf@example.com\nAYSE@example.com\nyusuf@example.com"
      )
    ).toEqual(["ayse@example.com", "yusuf@example.com"]);
  });

  it("keeps what is not an address, for the API to name", () => {
    expect(parseEmailList("adres-degil\nayse@example.com")).toEqual([
      "adres-degil",
      "ayse@example.com",
    ]);
  });

  it("reads nothing out of an empty or blank text", () => {
    expect(parseEmailList("")).toEqual([]);
    expect(parseEmailList(" \n ,; \n")).toEqual([]);
  });

  it("takes 500 addresses at most, as tedrisat does", () => {
    expect(BULK_MAX).toBe(500);
  });
});

describe("the answer", () => {
  it("is a line per outcome that holds anyone, in a fixed order", () => {
    const lines = outcomeLines(
      answer({
        skipped: [{ email: "x@example.com", reason: "barred" }],
        already: ["k@example.com", "l@example.com"],
        enrolled: ["a@example.com"],
      })
    );
    expect(lines).toEqual([
      { outcome: "enrolled", count: 1 },
      { outcome: "already", count: 2 },
      { outcome: "skipped", count: 1 },
    ]);
    expect(
      lines.map(({ outcome, count }) =>
        t(`CourseStudents.bulk.outcomes.${outcome}`, { count })
      )
    ).toEqual(["1 talebe eklendi", "2 zaten kayıtlı", "1 adres atlandı"]);
  });

  it("gives the addresses with no account, then the ones that are not addresses, to copy", () => {
    expect(
      unmatched(
        answer({
          notFound: ["kimse@example.com"],
          invalid: ["adres-degil"],
        })
      )
    ).toEqual(["kimse@example.com", "adres-degil"]);
  });

  it("words every reason tedrisat gives, and one it may give later", () => {
    expect(
      ["barred", "revoked", "COMPLETED", "changed", "SOMETHING_NEW"].map(
        (reason) => t(`CourseStudents.bulk.reasons.${skipReasonKey(reason)}`)
      )
    ).toEqual([
      "Bu derse girişi yasaklı",
      "Ders kadrosu dersten çıkarmış",
      "Dersi tamamlamış",
      "Kaydı bu sırada değişti; yeniden deneyin",
      "Eklenmedi",
    ]);
  });

  it("words a refusal from its code", () => {
    expect(bulkErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(bulkErrorKey("COURSE_NOT_FOUND")).toBe(
      "CourseStudents.bulk.errors.closed"
    );
    expect(bulkErrorKey("KEYCLOAK_ADMIN_NOT_CONFIGURED")).toBe(
      "CourseStudents.bulk.errors.directory"
    );
    expect(bulkErrorKey("KEYCLOAK_ADMIN_UNAVAILABLE")).toBe(
      "CourseStudents.bulk.errors.directory"
    );
    expect(bulkErrorKey("")).toBe("Problems.actionGeneric");
  });
});
