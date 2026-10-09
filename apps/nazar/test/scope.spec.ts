import { describe, expect, it } from "vitest";
import {
  buildScopes,
  defaultScope,
  displayName,
  findScope,
  heldRoles,
  landingPath,
  medreseCourseLinks,
  NO_ACCESS_PATH,
  panoHref,
  parseScopeCookie,
  runsMedrese,
  SCOPE_COOKIE,
  scopeHref,
  scopeKey,
  serializeScopeCookie,
} from "~/features/shell/scope";
import { assignment, course, medrese } from "./fixtures";

const bina = assignment({
  id: "a-1",
  scopeId: "c-bina",
  scopeName: "Bina ve İzhar Şerhi",
  isImam: true,
  course: course(),
});
const mantik = assignment({
  id: "a-2",
  scopeId: "c-mantik",
  scopeName: "İsâgûcî ile mantığa giriş",
  course: course({ koskName: "Fatih Köşkü" }),
});

describe("buildScopes", () => {
  it("puts the medrese first and the courses after it, each by name", () => {
    const scopes = buildScopes([mantik, bina, medrese()]);
    expect(scopes.map((s) => scopeKey(s))).toEqual([
      "medrese:m-1",
      "ders:c-bina",
      "ders:c-mantik",
    ]);
  });

  it("orders names by the Turkish alphabet", () => {
    const names = buildScopes([
      assignment({ scopeId: "1", scopeName: "Zübde" }),
      assignment({ scopeId: "2", scopeName: "İlm-i hâl" }),
      assignment({ scopeId: "3", scopeName: "Işık" }),
      assignment({ scopeId: "4", scopeName: "Çağrı" }),
    ]).map((s) => s.name);
    expect(names).toEqual(["Çağrı", "Işık", "İlm-i hâl", "Zübde"]);
  });

  it("makes one scope of two roles in a medrese and keeps the stronger label", () => {
    const scopes = buildScopes([
      medrese({ id: "a-n", role: "MEDRESE_NAZIR" }),
      medrese({ id: "a-b", role: "MEDRESE_BASMUDERRIS" }),
    ]);
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.role).toBe("MEDRESE_BASMUDERRIS");

    // The order the API sends them in does not matter.
    const reversed = buildScopes([
      medrese({ id: "a-b", role: "MEDRESE_BASMUDERRIS" }),
      medrese({ id: "a-n", role: "MEDRESE_NAZIR" }),
    ]);
    expect(reversed[0]?.role).toBe("MEDRESE_BASMUDERRIS");
  });

  it("makes one scope of müderris and ders nazırı of a course, imam kept", () => {
    const [scope, ...rest] = buildScopes([
      assignment({
        id: "a-d",
        role: "DERS_NAZIR",
        isImam: false,
        scopeId: "c",
      }),
      assignment({ id: "a-m", role: "MUDERRIS", isImam: true, scopeId: "c" }),
    ]);
    expect(rest).toEqual([]);
    expect(scope).toMatchObject({ role: "MUDERRIS", isImam: true });
  });

  it("does not make a ders nazırı an imam", () => {
    const [scope] = buildScopes([
      assignment({ role: "DERS_NAZIR", isImam: true, scopeId: "c" }),
    ]);
    expect(scope).toMatchObject({ role: "DERS_NAZIR", isImam: false });
  });

  it("reads a course's köşk", () => {
    expect(buildScopes([bina])[0]?.koskName).toBe("Nûruosmaniye Köşkü");
    expect(buildScopes([medrese()])[0]?.koskName).toBeNull();
  });

  it("leaves out the platform's and the köşk's roles and a scope with no id", () => {
    expect(
      buildScopes([
        assignment({
          role: "MEDARIS_NAZIM",
          scopeType: "platform",
          scopeId: null,
        }),
        assignment({ role: "KOSK_NAZIM", scopeType: "kosk", scopeId: "k" }),
        assignment({ scopeId: null }),
      ])
    ).toEqual([]);
  });
});

describe("heldRoles", () => {
  it("lists each role once, strongest first", () => {
    expect(
      heldRoles([
        { role: "MUDERRIS" },
        { role: "MEDRESE_BASMUDERRIS" },
        { role: "MUDERRIS" },
        { role: "KOSK_NAZIM" },
      ])
    ).toEqual(["KOSK_NAZIM", "MEDRESE_BASMUDERRIS", "MUDERRIS"]);
    expect(heldRoles([])).toEqual([]);
  });
});

describe("the scope cookie", () => {
  it("round-trips through the string the page writes", () => {
    const written = serializeScopeCookie({ kind: "ders", id: "c-bina" });
    expect(written).toMatch(new RegExp(`^${SCOPE_COOKIE}=`));
    expect(written).toContain("path=/");
    expect(written).toContain("samesite=lax");
    const value = written.split(";")[0]?.slice(SCOPE_COOKIE.length + 1);
    expect(parseScopeCookie(value)).toEqual({ kind: "ders", id: "c-bina" });
    // What Next hands over is already decoded.
    expect(parseScopeCookie("medrese:m-1")).toEqual({
      kind: "medrese",
      id: "m-1",
    });
  });

  it("refuses anything that is not a kind and an id", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "medrese",
      "medrese:",
      "kosk:1",
      "ders:../etc",
      "ders:a b",
      "medrese:%E0%A4%A",
      `medrese:${"a".repeat(65)}`,
    ]) {
      expect(parseScopeCookie(bad), String(bad)).toBeNull();
    }
  });
});

describe("the scope a person lands in", () => {
  const scopes = buildScopes([medrese(), bina, mantik]);
  const coursesOnly = buildScopes([bina, mantik]);

  it("is the remembered scope while the person still holds it", () => {
    expect(defaultScope(scopes, "ders:c-mantik")).toMatchObject({
      id: "c-mantik",
    });
    expect(landingPath(scopes, "ders:c-mantik")).toBe("/ders/c-mantik");
  });

  it("is the first medrese when nothing is remembered or the memory is stale", () => {
    expect(defaultScope(scopes, undefined)?.id).toBe("m-1");
    expect(defaultScope(scopes, "ders:gone")?.id).toBe("m-1");
    expect(defaultScope(scopes, "garbage")?.id).toBe("m-1");
  });

  it("is the first course when there is no medrese", () => {
    expect(defaultScope(coursesOnly, undefined)?.id).toBe("c-bina");
    expect(defaultScope(coursesOnly, "medrese:m-1")?.id).toBe("c-bina");
  });

  it("is the no-access page for a person with no scope, whatever is remembered", () => {
    expect(defaultScope([], "medrese:m-1")).toBeNull();
    expect(landingPath([], "medrese:m-1")).toBe(NO_ACCESS_PATH);
    expect(NO_ACCESS_PATH).toBe("/erisim-yok");
  });
});

describe("addresses", () => {
  const [m, c] = buildScopes([medrese(), bina]);

  it("puts the kind and the id in the path", () => {
    expect(scopeHref(m as never)).toBe("/medrese/m-1");
    expect(scopeHref(c as never)).toBe("/ders/c-bina");
    expect(scopeHref({ kind: "ders", id: "a b" })).toBe("/ders/a%20b");
  });

  it("finds a scope by kind and id, in any case, and not under the other kind", () => {
    const scopes = buildScopes([medrese({ scopeId: "ABC-1" }), bina]);
    expect(findScope(scopes, "medrese", "abc-1")).toBeDefined();
    expect(findScope(scopes, "ders", "abc-1")).toBeUndefined();
    expect(findScope(scopes, "ders", "nobody")).toBeUndefined();
  });

  it("opens a medrese's Pano from a course, and falls back to the course without one", () => {
    const both = buildScopes([medrese(), bina]);
    expect(panoHref(both, both[0] as never)).toBe("/medrese/m-1");
    expect(panoHref(both, both[1] as never)).toBe("/medrese/m-1");
    const only = buildScopes([bina]);
    expect(panoHref(only, only[0] as never)).toBe("/ders/c-bina");
  });
});

describe("displayName", () => {
  it("prefers the name, then given and family name, then the e-mail", () => {
    expect(displayName({ name: " Mehmet Emin Işıkoğlu " })).toBe(
      "Mehmet Emin Işıkoğlu"
    );
    expect(
      displayName({ given_name: "Elif Nur", family_name: "Taşdelen" })
    ).toBe("Elif Nur Taşdelen");
    expect(displayName({ email: "elif@example.com" })).toBe("elif@example.com");
    expect(displayName({})).toBe("");
  });
});

describe("who runs a medrese (runsMedrese)", () => {
  it("is its başmüderris, and the başnazım whatever seat he holds there", () => {
    expect(runsMedrese({ role: "MEDRESE_BASMUDERRIS" }, false)).toBe(true);
    for (const role of ["SYSTEM_ADMIN", "MEDRESE_NAZIR"]) {
      expect(runsMedrese({ role }, true), role).toBe(true);
    }
    expect(runsMedrese(undefined, true)).toBe(true);
  });

  it("is never a nazır of the medrese, nor someone with no scope there", () => {
    expect(runsMedrese({ role: "MEDRESE_NAZIR" }, false)).toBe(false);
    expect(runsMedrese(undefined, false)).toBe(false);
  });
});

describe("the courses a medrese's lists link to (medreseCourseLinks)", () => {
  it("is every course listed, lower case: whoever is on a medrese's pages opens its courses", () => {
    expect([...medreseCourseLinks(["c-bina", "C-OTHER"])]).toEqual([
      "c-bina",
      "c-other",
    ]);
    expect(medreseCourseLinks([]).size).toBe(0);
  });
});
