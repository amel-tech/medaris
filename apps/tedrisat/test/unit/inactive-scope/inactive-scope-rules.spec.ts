import { describe, expect, it } from "vitest";
import {
  endedAt,
  endReason,
  MANAGER_OF,
} from "../../../src/inactive-scope/inactive-scope.rules";

const d = (iso: string) => new Date(iso);

describe("endReason (nizam/14's Neden column)", () => {
  it("is EXPIRED when nobody took the post away", () => {
    expect(
      endReason({ revokedAt: null, expiresAt: d("2026-09-27T09:00:00Z") })
    ).toBe("EXPIRED");
  });

  it("is REMOVED when somebody revoked it before any end date", () => {
    expect(
      endReason({ revokedAt: d("2026-09-30T09:00:00Z"), expiresAt: null })
    ).toBe("REMOVED");
    expect(
      endReason({
        revokedAt: d("2026-09-30T09:00:00Z"),
        expiresAt: d("2026-12-31T00:00:00Z"),
      })
    ).toBe("REMOVED");
  });

  it("is EXPIRED when the post lapsed first and was only tidied up after", () => {
    expect(
      endReason({
        revokedAt: d("2026-10-01T09:00:00Z"),
        expiresAt: d("2026-09-27T09:00:00Z"),
      })
    ).toBe("EXPIRED");
  });
});

describe("endedAt", () => {
  it("is the earlier of the two dates", () => {
    expect(
      endedAt({
        revokedAt: d("2026-10-01T09:00:00Z"),
        expiresAt: d("2026-09-27T09:00:00Z"),
      })
    ).toEqual(d("2026-09-27T09:00:00Z"));
    expect(
      endedAt({ revokedAt: d("2026-10-01T09:00:00Z"), expiresAt: null })
    ).toEqual(d("2026-10-01T09:00:00Z"));
  });

  it("is null for a post that has not ended", () => {
    expect(endedAt({ revokedAt: null, expiresAt: null })).toBeNull();
  });
});

describe("MANAGER_OF", () => {
  it("names the role whose absence makes each kind of scope passive", () => {
    expect(MANAGER_OF.KOSK.role).toBe("KOSK_NAZIM");
    expect(MANAGER_OF.MADRASAH.role).toBe("MEDRESE_BASMUDERRIS");
    expect(MANAGER_OF.COURSE.role).toBe("MUDERRIS");
  });
});
