import { describe, expect, it } from "vitest";
import {
  headsMedrese,
  MEDRESE_HEAD_ROLE,
  mayOpenScopePages,
} from "~/features/shell/abilities";

/**
 * The portal's half of the medrese page table (MDRS-223). The other half,
 * `apps/tedrisat/test/unit/authz/nazir-medrese-menu.spec.ts`, pins that every
 * route a medrese page reads carries `MANAGE_MADRASAH`, which the matrix holds
 * on the başmüderris's row and not on `PUBLIC`, where a medrese nazırı lands.
 * Change both together.
 *
 *   scope    | role                 | pages offered
 *   medrese  | MEDRESE_BASMUDERRIS  | all
 *   medrese  | MEDRESE_NAZIR        | none
 *   ders     | any                  | all (placeholders, no API read yet)
 */
describe("which scope pages the portal offers", () => {
  it("names the başmüderris as the medrese's head", () => {
    expect(MEDRESE_HEAD_ROLE).toBe("MEDRESE_BASMUDERRIS");
  });

  it("offers a medrese's pages to its başmüderris alone", () => {
    expect(
      mayOpenScopePages({ kind: "medrese", role: "MEDRESE_BASMUDERRIS" })
    ).toBe(true);
    for (const role of [
      "MEDRESE_NAZIR",
      "MUDERRIS",
      "DERS_NAZIR",
      "KOSK_NAZIM",
      "MEDARIS_NAZIM",
      "",
    ]) {
      expect(mayOpenScopePages({ kind: "medrese", role }), role).toBe(false);
    }
  });

  it("offers a course's pages whatever the role", () => {
    for (const role of ["MUDERRIS", "DERS_NAZIR"]) {
      expect(mayOpenScopePages({ kind: "ders", role }), role).toBe(true);
    }
  });

  it("calls only a medrese headed, never a course", () => {
    expect(headsMedrese({ kind: "medrese", role: "MEDRESE_BASMUDERRIS" })).toBe(
      true
    );
    expect(headsMedrese({ kind: "medrese", role: "MEDRESE_NAZIR" })).toBe(
      false
    );
    expect(headsMedrese({ kind: "ders", role: "MEDRESE_BASMUDERRIS" })).toBe(
      false
    );
  });
});
