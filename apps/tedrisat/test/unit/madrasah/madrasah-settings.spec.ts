import {
  ASSIGNED_ROLES,
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  type AuthzMeta,
  ENTITIES,
  PERMISSIONS,
  type PermissionCode,
} from "@medaris/common";
import { describe, expect, it } from "vitest";
import { MadrasahController } from "../../../src/madrasah/madrasah.controller";
import {
  NO_POLICIES,
  planSettingsUpdate,
} from "../../../src/madrasah/madrasah-settings";
import { MadrasahNazirController } from "../../../src/madrasah/nazir/madrasah-nazir.controller";
import { permissionsOf, rolesHolding } from "../../helpers/authz-holders";

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
  // What each route asks for. The nazır routes take either the medrese's own
  // permission or the Medaris nazımı's, which the platform gives (MDRS-135).
  const NAZIR_APPOINT: readonly PermissionCode[] = [
    PERMISSIONS.MADRASAH_NAZIR_APPOINT,
    PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
  ];
  const routes: Array<
    [string, (...args: never[]) => unknown, readonly PermissionCode[]]
  > = [
    [
      "GET settings",
      MadrasahController.prototype.getSettings,
      [PERMISSIONS.MADRASAH_SETTINGS_EDIT],
    ],
    [
      "PATCH settings",
      MadrasahController.prototype.updateSettings,
      [PERMISSIONS.MADRASAH_SETTINGS_EDIT],
    ],
    [
      "GET courses",
      MadrasahController.prototype.findCourses,
      [
        PERMISSIONS.MADRASAH_COURSE_OPEN,
        PERMISSIONS.MADRASAH_COURSE_HIDE,
        PERMISSIONS.MADRASAH_MUDERRIS_MANAGE,
      ],
    ],
    ["GET nazirs", MadrasahNazirController.prototype.list, NAZIR_APPOINT],
    [
      "POST nazirs/:userId",
      MadrasahNazirController.prototype.addNazir,
      NAZIR_APPOINT,
    ],
    [
      "GET nazirs/:userId/grants",
      MadrasahNazirController.prototype.grants,
      NAZIR_APPOINT,
    ],
    [
      "DELETE nazirs/:userId",
      MadrasahNazirController.prototype.removeNazir,
      NAZIR_APPOINT,
    ],
  ];

  it.each(
    routes
  )("%s is never open to a caller with no token", (_name, handler) => {
    expect(Reflect.getMetadata(AUTHZ_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it.each(
    routes
  )("%s needs a permission only a medrese's başmüderris holds by default", (_name, handler, permission) => {
    const meta = Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta;
    expect(permissionsOf(meta)).toEqual(permission);
    // A stranger (PUBLIC) and a caller with no token (ANONYMOUS) get 403; a
    // medrese nazırı and a Medaris nazımı hold it only through a grant.
    expect(rolesHolding(permissionsOf(meta), ENTITIES.MADRASAH)).toEqual([
      ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
    ]);
  });
});
