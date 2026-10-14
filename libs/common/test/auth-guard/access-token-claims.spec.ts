import { mapAccessTokenClaims } from "../../src";

/**
 * Auth audit C5: the IdP-specific claims are read in one mapping. These pin
 * Keycloak's, the only one today. `AuthzService.isSystemAdmin` reads through
 * it; test/authz/authz.service.spec.ts keeps pinning that check as it was.
 */
describe("mapAccessTokenClaims (Keycloak)", () => {
  it("reads typ, azp, realm roles and client roles", () => {
    expect(
      mapAccessTokenClaims({
        sub: "u-1",
        typ: "Bearer",
        azp: "tedris-web",
        realm_access: { roles: ["SYSTEM_ADMIN", "offline_access"] },
        resource_access: {
          account: { roles: ["manage-account"] },
          "tedrisat-api": { roles: [] },
        },
      })
    ).toEqual({
      isAccessToken: true,
      tokenType: "Bearer",
      clientId: "tedris-web",
      roles: ["SYSTEM_ADMIN", "offline_access"],
      clientRoles: { account: ["manage-account"], "tedrisat-api": [] },
    });
  });

  it("tells an ID or refresh token from an access token", () => {
    expect(mapAccessTokenClaims({ typ: "ID" }).isAccessToken).toBe(false);
    expect(mapAccessTokenClaims({ typ: "Refresh" }).isAccessToken).toBe(false);
    expect(mapAccessTokenClaims({}).isAccessToken).toBe(false);
  });

  it("reads the account's gender from the `gender` claim (#317)", () => {
    expect(mapAccessTokenClaims({ gender: "FEMALE" }).gender).toBe("FEMALE");
    expect(mapAccessTokenClaims({ gender: "MALE" }).gender).toBe("MALE");
  });

  it("reads a missing or unknown gender as none, never as a third value", () => {
    // A token from before the scope's rollout: the ordinary case today.
    expect(mapAccessTokenClaims({ typ: "Bearer" }).gender).toBeUndefined();
    for (const gender of [
      "female",
      "Male",
      "OTHER",
      "",
      null,
      42,
      ["FEMALE"],
      { value: "MALE" },
    ]) {
      expect(mapAccessTokenClaims({ gender }).gender, String(gender)).toBe(
        undefined
      );
    }
  });

  it("reads missing or malformed claims as nothing, never as a grant", () => {
    expect(
      mapAccessTokenClaims({
        azp: 42,
        realm_access: { roles: "SYSTEM_ADMIN" },
        resource_access: "account",
      })
    ).toMatchObject({ clientId: undefined, roles: [], clientRoles: {} });
    expect(mapAccessTokenClaims({ realm_access: null }).roles).toEqual([]);
    expect(
      mapAccessTokenClaims({ realm_access: { roles: ["SYSTEM_ADMIN", 7] } })
        .roles
    ).toEqual(["SYSTEM_ADMIN"]);
  });
});
