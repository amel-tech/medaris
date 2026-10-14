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
import { PartnerRoleMissingError } from "../../../src/integration/errors/partner-errors";
import {
  PartnerGuard,
  partnerClaimPolicy,
} from "../../../src/integration/partner.guard";
import type { PartnerRequest } from "../../../src/integration/partner-request";

/**
 * The policy of `PartnerGuard`, the one guard of `/integrations/*` (partner
 * enrollments): a token tedrisat verifies, whose `azp` is one of
 * `INTEGRATION_PARTNERS`, carrying the `partner-enrollment` realm role, with
 * tedrisat's audience. No partner configured: 404 for everything. And the
 * other half: `AuthGuard`'s verifier, under the configuration tedrisat builds,
 * refuses the partner's token.
 *
 * Own keypair and in-process key provider, as jwt-claim-validation.spec.ts
 * does: a unit spec with no container.
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

function config(partners: (typeof PARTNER)[] = [PARTNER]) {
  return new ConfigService({
    integrations: { partners },
    keycloak: {
      issuer: ISSUER,
      audience: AUDIENCE,
      allowedClients: "tedris-web,nazar-web",
      refusedClients: partners.map((p) => p.clientId),
    },
  });
}

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

const run = (guard: PartnerGuard, request: PartnerRequest) =>
  guard.canActivate(contextFor(request));

describe("PartnerGuard (partner enrollments)", () => {
  it("admits a partner's token with the role and names the partner, never a user", async () => {
    const request = requestWith(`Bearer ${token()}`);

    await expect(
      run(new PartnerGuard(keyProvider, config()), request)
    ).resolves.toBe(true);
    expect(request.partner).toEqual({ ...PARTNER, actorId: SERVICE_ACCOUNT });
    expect((request as { user?: unknown }).user).toBeUndefined();
  });

  it("refuses a token issued to another client: a front-end's, or an unknown one", async () => {
    const guard = new PartnerGuard(keyProvider, config());

    for (const azp of ["tedris-web", "baska-uygulama"]) {
      await expect(
        run(guard, requestWith(`Bearer ${token({ azp })}`))
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it("refuses a partner's token without the partner-enrollment role with 403", async () => {
    const guard = new PartnerGuard(keyProvider, config());
    const request = requestWith(
      `Bearer ${token({ realm_access: { roles: ["default-roles-medaris"] } })}`
    );

    await expect(run(guard, request)).rejects.toBeInstanceOf(
      PartnerRoleMissingError
    );
    expect(request.partner).toBeUndefined();
  });

  it("refuses a token for another audience, an expired one, and none at all", async () => {
    const guard = new PartnerGuard(keyProvider, config());
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

  it("answers 404 to everything when no partner is configured, before reading the token", async () => {
    const guard = new PartnerGuard(keyProvider, config([]));

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
  const guardWith = (allowedClients: string) =>
    new AuthGuard(
      new JwtVerifierService(
        keyProvider,
        new ConfigService({
          keycloak: {
            issuer: ISSUER,
            audience: AUDIENCE,
            allowedClients,
            refusedClients: [PARTNER.clientId],
          },
        })
      ),
      new Reflector()
    );

  it("refuses a partner's token, with or without an azp allow-list", async () => {
    for (const allowed of ["", "tedris-web"]) {
      await expect(
        guardWith(allowed).canActivate(
          contextFor(requestWith(`Bearer ${token()}`))
        )
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // A person's token still passes where the allow-list is empty.
    await expect(
      guardWith("").canActivate(
        contextFor(
          requestWith(
            `Bearer ${token({ azp: "tedris-web", realm_access: {} })}`
          )
        )
      )
    ).resolves.toBe(true);
  });
});
