import {
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  type AuthzMeta,
  ENTITIES,
  MATRIX,
  ROLES,
  SCOPES,
} from "@medaris/common";
import { describe, expect, it } from "vitest";
import { MadrasahController } from "../../../src/madrasah/madrasah.controller";
import {
  NO_POLICIES,
  planSettingsUpdate,
} from "../../../src/madrasah/madrasah-settings";
import { MadrasahNazirController } from "../../../src/madrasah/nazir/madrasah-nazir.controller";

/**
 * MDRS-184: what saving nazir/04 changes, and who may call the routes behind
 * nazir/04 and nazir/05. The routes' database behaviour is covered end to end
 * in test/e2e/madrasah-settings.e2e.spec.ts and madrasah-nazir.e2e.spec.ts;
 * these run without a container.
 */
const current = {
  name: "Süleymaniye Medresesi",
  description: "Klasik medrese müfredatı." as string | null,
  policies: { ...NO_POLICIES },
};

describe("planSettingsUpdate", () => {
  it("changes nothing for a save that sends what is already there", () => {
    const plan = planSettingsUpdate(current, {
      name: "  Süleymaniye Medresesi ",
      description: "Klasik medrese müfredatı.",
      policies: { alwaysApproval: false },
    });
    expect(plan.changes).toEqual({});
    expect(plan.next).toEqual(current);
  });

  it("leaves out of the plan what the save leaves out", () => {
    const plan = planSettingsUpdate(current, {
      policies: { noPublicRecordings: true },
    });
    expect(plan.changes).toEqual({
      "policies.noPublicRecordings": { from: false, to: true },
    });
    expect(plan.next).toEqual({
      ...current,
      policies: { ...NO_POLICIES, noPublicRecordings: true },
    });
    // The state it was given is not written to.
    expect(current.policies.noPublicRecordings).toBe(false);
  });

  it("trims the name and reads a blank description as none", () => {
    expect(
      planSettingsUpdate(current, { name: "  Fatih Medresesi " }).next.name
    ).toBe("Fatih Medresesi");
    for (const blank of ["", "   ", null]) {
      const plan = planSettingsUpdate(current, { description: blank });
      expect(plan.next.description).toBeNull();
      expect(plan.changes.description).toEqual({
        from: "Klasik medrese müfredatı.",
        to: null,
      });
    }
    // Clearing what is already clear is no change.
    expect(
      planSettingsUpdate({ ...current, description: null }, { description: "" })
        .changes
    ).toEqual({});
  });
});

describe("authorization of the nazir/04 and nazir/05 routes", () => {
  const routes: Array<[string, (...args: never[]) => unknown, string]> = [
    [
      "GET settings",
      MadrasahController.prototype.getSettings,
      SCOPES.MANAGE_MADRASAH,
    ],
    [
      "PATCH settings",
      MadrasahController.prototype.updateSettings,
      SCOPES.MANAGE_MADRASAH,
    ],
    [
      "GET courses",
      MadrasahController.prototype.findCourses,
      SCOPES.MANAGE_MADRASAH,
    ],
    [
      "GET nazirs",
      MadrasahNazirController.prototype.list,
      SCOPES.MANAGE_MADRASAH,
    ],
    [
      "POST nazirs/:userId",
      MadrasahNazirController.prototype.addNazir,
      SCOPES.INVITE_NAZIR,
    ],
    [
      "GET nazirs/:userId/grants",
      MadrasahNazirController.prototype.grants,
      SCOPES.REMOVE_NAZIR,
    ],
    [
      "DELETE nazirs/:userId",
      MadrasahNazirController.prototype.removeNazir,
      SCOPES.REMOVE_NAZIR,
    ],
  ];

  it.each(
    routes
  )("%s is never open to a caller with no token", (_name, handler) => {
    expect(Reflect.getMetadata(AUTHZ_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it.each(
    routes
  )("%s needs a scope only a medrese's başmüderris holds", (_name, handler, scope) => {
    const meta = Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta;
    expect(meta.scope).toBe(scope);
    const holders = Object.entries(MATRIX[ENTITIES.MADRASAH])
      .filter(([, scopes]) => scopes?.includes(meta.scope))
      .map(([role]) => role);
    // A stranger (PUBLIC) and a caller with no token (ANONYMOUS) get 403.
    expect(holders).toEqual([ROLES.MADRASAH_NAZIR]);
  });
});
