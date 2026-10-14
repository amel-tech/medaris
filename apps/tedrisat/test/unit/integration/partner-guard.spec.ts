import { createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import {
  AuthGuard,
  IPublicKeyProvider,
  JwtVerifierService,
  KeyNotFoundError,
  loadJwtClaimPolicy,
} from "@medaris/common";
import {
  type ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { IRegisteredPartner } from "../../../src/integration/domain/partner-registry";
import {
  PartnerDisabledError,
  PartnerRoleMissingError,
} from "../../../src/integration/errors/partner-errors";
import {
  PartnerGuard,
  partnerClaimPolicy,
} from "../../../src/integration/partner.guard";
import type { PartnerRegistry } from "../../../src/integration/partner-registry";
import type { PartnerRequest } from "../../../src/integration/partner-request";

/**
 * The policy of `PartnerGuard`, the one guard of `/integrations/*` (partner
 * enrollments): a token tedrisat verifies, whose `azp` is a registered
 * partner's, of a partner that is enabled, carrying the `partner-enrollment`
 * realm role, with tedrisat's audience. No partner registered: 404 for
 * everything. And the other half: `AuthGuard`'s verifier, with the registry
 * as its refused-client source, refuses every registered partner's token.
 *
 * Own keypair and in-process key provider, as jwt-claim-validation.spec.ts
 * does, and an in-memory registry: a unit spec with no container.
 */
const KID = "partner-guard-kid";
const ISSUER = "https://keycloak.invalid/realms/medaris";
const AUDIENCE = "tedrisat-api";
const SERVICE_ACCOUNT = "7b1f3c2a-9d4e-4f60-8a1b-2c3d4e5f6a7b";
const PARTNER = { clientId: "ornek-uygulama", name: "Örnek Uygulama" };

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const keyProvider: IPublicKeyProvider = {
  async getKey({ kid }) {
    if (kid !== KID) throw new KeyNotFoundError();
    return createPublicKey(publicKey);
  },
};

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** A Keycloak-shaped client-credentials token of the partner's service account. */
function token(overrides: Record<string, unknown> = {}): string {
  const iat = Math.floor(Date.now() / 1000);
  const input = `${b64({ alg: "RS256", typ: "JWT", kid: KID })}.${b64({
    iss: ISSUER,
    aud: AUDIENCE,
    sub: SERVICE_ACCOUNT,
    typ: "Bearer",
    azp: PARTNER.clientId,
    realm_access: { roles: ["partner-enrollment", "default-roles-medaris"] },
    iat,
    exp: iat + 300,
    ...overrides,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(input)
    .end()
    .sign(privateKey)
    .toString("base64url");
  return `${input}.${signature}`;
}

function config(allowedClients = "tedris-web,nazar-web") {
  return new ConfigService({
    keycloak: { issuer: ISSUER, audience: AUDIENCE, allowedClients },
  });
}

/** The registry as `PartnerGuard` and the verifier read it, held in memory. */
function registryOf(partners: IRegisteredPartner[]): PartnerRegistry {
  const all = async () =>
    new Map(partners.map((partner) => [partner.clientId, partner]));
  return {
    all,
    find: async (clientId: string) => (await all()).get(clientId) ?? null,
    isRefused: async (clientId: string) => (await all()).has(clientId),
    invalidate: () => undefined,
  } as unknown as PartnerRegistry;
}

const registered = (enabled = true) => registryOf([{ ...PARTNER, enabled }]);

function contextFor(request: PartnerRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

const requestWith = (authorization?: string): PartnerRequest => ({
  headers: authorization === undefined ? {} : { authorization },
  method: "PUT",
  url: "/integrations/enrollments/R-1/tecvid",
  originalUrl: "/integrations/enrollments/R-1/tecvid",
});

const guardWith = (registry = registered()) =>
  new PartnerGuard(keyProvider, config(), registry);

const run = (guard: PartnerGuard, request: PartnerRequest) =>
  guard.canActivate(contextFor(request));

describe("PartnerGuard (partner enrollments)", () => {
  it("admits a registered partner's token with the role and names the partner, never a user", async () => {
    const request = requestWith(`Bearer ${token()}`);

    await expect(run(guardWith(), request)).resolves.toBe(true);
    expect(request.partner).toEqual({ ...PARTNER, actorId: SERVICE_ACCOUNT });
    expect((request as { user?: unknown }).user).toBeUndefined();
  });

  it("refuses a token issued to another client: a front-end's, or an unregistered one", async () => {
    const guard = guardWith();

    for (const azp of ["tedris-web", "baska-uygulama"]) {
      await expect(
        run(guard, requestWith(`Bearer ${token({ azp })}`))
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it("refuses a partner's token without the partner-enrollment role with 403", async () => {
    const request = requestWith(
      `Bearer ${token({ realm_access: { roles: ["default-roles-medaris"] } })}`
    );

    await expect(run(guardWith(), request)).rejects.toBeInstanceOf(
      PartnerRoleMissingError
    );
    expect(request.partner).toBeUndefined();
  });

  it("refuses a disabled partner's token with 403, its role notwithstanding", async () => {
    const request = requestWith(`Bearer ${token()}`);

    const rejection = run(guardWith(registered(false)), request);
    await expect(rejection).rejects.toBeInstanceOf(PartnerDisabledError);
    await expect(rejection).rejects.toMatchObject({
      code: "PARTNER_DISABLED",
    });
    expect(request.partner).toBeUndefined();
  });

  it("reads the registry on every request: a partner registered later passes, one disabled later does not", async () => {
    let partners: IRegisteredPartner[] = [];
    const registry = {
      all: async () => new Map(partners.map((p) => [p.clientId, p])),
    } as unknown as PartnerRegistry;
    const guard = guardWith(registry);
    const attempt = () => run(guard, requestWith(`Bearer ${token()}`));

    await expect(attempt()).rejects.toBeInstanceOf(NotFoundException);
    partners = [{ ...PARTNER, enabled: true }];
    await expect(attempt()).resolves.toBe(true);
    partners = [{ ...PARTNER, enabled: false }];
    await expect(attempt()).rejects.toBeInstanceOf(PartnerDisabledError);
  });

  it("refuses a token for another audience, an expired one, and none at all", async () => {
    const guard = guardWith();
    const iat = Math.floor(Date.now() / 1000) - 600;

    for (const authorization of [
      `Bearer ${token({ aud: "teskilat-api" })}`,
      `Bearer ${token({ iat, exp: iat + 60 })}`,
      `Bearer ${token({ typ: "ID" })}`,
      `Basic ${token()}`,
      undefined,
    ]) {
      await expect(
        run(guard, requestWith(authorization))
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it("answers 404 to everything when no partner is registered, before reading the token", async () => {
    const guard = guardWith(registryOf([]));

    for (const authorization of [
      `Bearer ${token()}`,
      "Bearer junk",
      undefined,
    ]) {
      const rejection = run(guard, requestWith(authorization));
      await expect(rejection).rejects.toBeInstanceOf(NotFoundException);
      await expect(rejection).rejects.toThrow(
        "Cannot PUT /integrations/enrollments/R-1/tecvid"
      );
    }
  });

  it("holds the partners to tedrisat's issuer and audience, with themselves as the only clients", () => {
    const policy = partnerClaimPolicy(loadJwtClaimPolicy(config()), [PARTNER]);

    expect(policy).toEqual({
      issuer: ISSUER,
      audience: [AUDIENCE],
      allowedClients: ["ornek-uygulama"],
      refusedClients: [],
    });
  });
});

describe("AuthGuard, on every other route (partner enrollments)", () => {
  const authGuardWith = (allowedClients: string, registry = registered()) =>
    new AuthGuard(
      new JwtVerifierService(keyProvider, config(allowedClients), registry),
      new Reflector()
    );

  it("refuses a registered partner's token, enabled or not, with or without an azp allow-list", async () => {
    for (const registry of [registered(true), registered(false)]) {
      for (const allowed of ["", "tedris-web"]) {
        await expect(
          authGuardWith(allowed, registry).canActivate(
            contextFor(requestWith(`Bearer ${token()}`))
          )
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
    }
    // A person's token still passes where the allow-list is empty.
    await expect(
      authGuardWith("").canActivate(
        contextFor(
          requestWith(
            `Bearer ${token({ azp: "tedris-web", realm_access: {} })}`
          )
        )
      )
    ).resolves.toBe(true);
  });

  it("lets the same token through once nothing registers its client", async () => {
    // What the refusal rests on: the registry, not a list read at boot.
    await expect(
      authGuardWith("", registryOf([])).canActivate(
        contextFor(requestWith(`Bearer ${token()}`))
      )
    ).resolves.toBe(true);
  });
});
