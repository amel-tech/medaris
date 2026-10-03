import { ConfigService } from "@nestjs/config";
import { readKeycloakAdminConfig } from "../../../src/config/keycloak-admin-env";
import {
  KeycloakAdminNotConfiguredError,
  KeycloakAdminService,
  KeycloakAdminUnavailableError,
} from "../../../src/keycloak-admin/keycloak-admin.service";

const ENV = {
  KEYCLOAK_ISSUER: "https://auth.example.org/realms/medaris",
  KEYCLOAK_ADMIN_CLIENT_ID: "tedrisat-admin",
  KEYCLOAK_ADMIN_CLIENT_SECRET: "s3cret",
} as NodeJS.ProcessEnv;

describe("readKeycloakAdminConfig (MDRS-169)", () => {
  it("is null when neither key is set", () => {
    expect(readKeycloakAdminConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("derives the admin and token URLs from the issuer", () => {
    expect(readKeycloakAdminConfig(ENV)).toEqual({
      adminUrl: "https://auth.example.org/admin/realms/medaris",
      tokenUrl:
        "https://auth.example.org/realms/medaris/protocol/openid-connect/token",
      clientId: "tedrisat-admin",
      clientSecret: "s3cret",
    });
  });

  it("refuses one key without the other, and an issuer it cannot read", () => {
    expect(() =>
      readKeycloakAdminConfig({ ...ENV, KEYCLOAK_ADMIN_CLIENT_SECRET: "" })
    ).toThrow(/together/);
    expect(() =>
      readKeycloakAdminConfig({ ...ENV, KEYCLOAK_ISSUER: "https://x.org" })
    ).toThrow(/realms/);
  });
});

function serviceWith(
  fetchImpl: typeof fetch,
  admin: unknown = readKeycloakAdminConfig(ENV)
) {
  const config = { get: () => admin } as unknown as ConfigService;
  return new KeycloakAdminService(config, fetchImpl);
}

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("KeycloakAdminService", () => {
  it("answers 503-class errors when not configured", async () => {
    const service = serviceWith(vi.fn() as never, null);
    expect(service.isConfigured()).toBe(false);
    await expect(service.findByExactEmail("a@b.co")).rejects.toBeInstanceOf(
      KeycloakAdminNotConfiguredError
    );
  });

  it("asks for an exact match, maps the user and reuses the token", async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).endsWith("/token")
        ? ok({ access_token: "tok", expires_in: 300 })
        : ok([
            {
              id: "u1",
              email: "a@b.co",
              firstName: "A",
              lastName: "B",
              enabled: true,
            },
          ])
    );
    const service = serviceWith(fetchImpl as never);

    const first = await service.findByExactEmail("a@b.co");
    await service.findByExactEmail("a@b.co");

    expect(first).toEqual({
      id: "u1",
      email: "a@b.co",
      givenName: "A",
      familyName: "B",
    });
    const search = String(fetchImpl.mock.calls[1][0]);
    expect(search).toContain("exact=true");
    expect(search).toContain("email=a%40b.co");
    expect(
      fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith("/token"))
    ).toHaveLength(1);
  });

  it("skips a disabled account", async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).endsWith("/token")
        ? ok({ access_token: "tok", expires_in: 300 })
        : ok([{ id: "u1", email: "a@b.co", enabled: false }])
    );
    expect(
      await serviceWith(fetchImpl as never).findByExactEmail("a@b.co")
    ).toBeNull();
  });

  it("treats a missing realm role as nobody", async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).endsWith("/token")
        ? ok({ access_token: "tok", expires_in: 300 })
        : ok({}, 404)
    );
    expect(
      await serviceWith(fetchImpl as never).findByRealmRole("SYSTEM_ADMIN")
    ).toEqual([]);
  });

  it("turns a failing directory into one unavailable error", async () => {
    const fetchImpl = vi.fn(async () => ok({}, 500));
    await expect(
      serviceWith(fetchImpl as never).findByExactEmail("a@b.co")
    ).rejects.toBeInstanceOf(KeycloakAdminUnavailableError);
    const throwing = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      serviceWith(throwing as never).findByExactEmail("a@b.co")
    ).rejects.toBeInstanceOf(KeycloakAdminUnavailableError);
  });
});
