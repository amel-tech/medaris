import configuration from "../../src/config/config";
import { readIntegrationPartners } from "../../src/config/integration-partners-env";

const read = (value?: string, allowed?: string) =>
  readIntegrationPartners({
    INTEGRATION_PARTNERS: value,
    KEYCLOAK_ALLOWED_CLIENTS: allowed,
  } as NodeJS.ProcessEnv);

describe("INTEGRATION_PARTNERS (partner enrollments)", () => {
  it("is empty when unset or blank, so nothing is seeded", () => {
    expect(read(undefined)).toEqual([]);
    expect(read("")).toEqual([]);
    expect(read("  ")).toEqual([]);
  });

  it("reads comma-separated clientId=Display name pairs", () => {
    expect(
      read(" ornek-uygulama=Örnek Uygulama , ikinci.app = İkinci Uygulama,")
    ).toEqual([
      { clientId: "ornek-uygulama", name: "Örnek Uygulama" },
      { clientId: "ikinci.app", name: "İkinci Uygulama" },
    ]);
  });

  it("stops the boot on a malformed value rather than dropping a partner", () => {
    expect(() => read("ornek-uygulama")).toThrow(/clientId=Display name/);
    expect(() => read("ornek uygulama=Örnek")).toThrow(/not a client id/);
    expect(() => read("ornek-uygulama=")).toThrow(/display name/);
    expect(() => read("a=A,a=B")).toThrow(/listed twice/);
  });

  it("refuses a partner that is also a front-end client", () => {
    expect(() =>
      read("ornek-uygulama=Örnek Uygulama", "tedris-dev,ornek-uygulama")
    ).toThrow(/also in KEYCLOAK_ALLOWED_CLIENTS/);
  });

  describe("in the configuration", () => {
    const originalEnv = process.env;
    afterEach(() => {
      process.env = originalEnv;
    });

    // The registry is the database's now: the value only seeds it, and the
    // verifier refuses the registered clients through the registry, not
    // through a list read once at boot.
    it("lists the partners to seed, and refuses no client by configuration", () => {
      process.env = {
        ...originalEnv,
        INTEGRATION_PARTNERS: "ornek-uygulama=Örnek Uygulama",
      };
      const config = configuration();

      expect(config.integrations.seedPartners).toEqual([
        { clientId: "ornek-uygulama", name: "Örnek Uygulama" },
      ]);
      expect(config.keycloak).not.toHaveProperty("refusedClients");
    });

    it("seeds nothing when the value is unset", () => {
      process.env = { ...originalEnv };
      delete process.env.INTEGRATION_PARTNERS;
      const config = configuration();

      expect(config.integrations.seedPartners).toEqual([]);
    });
  });
});
