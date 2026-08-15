import { createHmac, createSign, generateKeyPairSync } from "node:crypto";
import {
  AuthGuard,
  IPublicKeyProvider,
  JWT_VERIFIER,
  JwtVerifierService,
  PUBLIC_KEY_PROVIDER,
} from "@medaris/common";
import { Controller, Get, INestApplication, UseGuards } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";

/**
 * Covers the claim checks MDRS-30 added to JwtVerifierService.
 *
 * The realm signing key is generated here rather than taken from
 * DummyPublicKeyProvider, which ships a public key only — there is no private
 * key in the repository to sign fixtures with. Tokens are assembled with
 * node:crypto rather than `jsonwebtoken` so the fixtures do not depend on the
 * same library that verifies them.
 */

const KID = "mdrs-30-test-kid";
const ISSUER = "https://keycloak.invalid/realms/medaris";
const AUDIENCE = "tedrisat-api";
const SUBJECT = "623fdf08-fd0e-481b-a927-4a1c15135e62";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

/** A second realm key, to prove `kid` resolution is not what is being tested. */
const otherKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const keyProvider: IPublicKeyProvider = {
  async getKey(kid: string): Promise<string> {
    if (kid !== KID) throw new Error("Key not found");
    return publicKey;
  },
};

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signingInput(header: object, payload: object): string {
  return `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

type Claims = Record<string, unknown>;

/** A Keycloak-shaped access token for this API. */
function validClaims(overrides: Claims = {}): Claims {
  const iat = nowInSeconds();

  return {
    exp: iat + 300,
    iat,
    iss: ISSUER,
    aud: AUDIENCE,
    sub: SUBJECT,
    typ: "Bearer",
    azp: "tedris-web",
    preferred_username: "test",
    ...overrides,
  };
}

function signRs256(claims: Claims, key: string = privateKey): string {
  const input = signingInput({ alg: "RS256", typ: "JWT", kid: KID }, claims);
  const signature = createSign("RSA-SHA256").update(input).end().sign(key);

  return `${input}.${base64url(signature)}`;
}

/**
 * The algorithm-confusion attack: the attacker knows the realm's public key —
 * it is published in the JWKS — and uses it as an HMAC secret.
 */
function signHs256(claims: Claims): string {
  const input = signingInput({ alg: "HS256", typ: "JWT", kid: KID }, claims);
  const signature = createHmac("sha256", publicKey).update(input).digest();

  return `${input}.${base64url(signature)}`;
}

function keycloakConfig(overrides: Record<string, unknown> = {}) {
  return {
    keycloak: {
      jwksUrl: "https://keycloak.invalid/realms/medaris/.../certs",
      issuer: ISSUER,
      audience: AUDIENCE,
      allowedClients: "",
      ...overrides,
    },
  };
}

async function createVerifier(
  overrides: Record<string, unknown> = {}
): Promise<JwtVerifierService> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        load: [() => keycloakConfig(overrides)],
        isGlobal: true,
      }),
    ],
    providers: [
      { provide: PUBLIC_KEY_PROVIDER, useValue: keyProvider },
      JwtVerifierService,
    ],
  }).compile();

  return moduleRef.get(JwtVerifierService);
}

describe("JwtVerifierService claim validation", () => {
  describe("the claim policy is mandatory", () => {
    it("refuses to construct without keycloak.issuer", async () => {
      await expect(createVerifier({ issuer: undefined })).rejects.toThrow(
        /KEYCLOAK_ISSUER/
      );
    });

    it("refuses to construct without keycloak.audience", async () => {
      await expect(createVerifier({ audience: "" })).rejects.toThrow(
        /KEYCLOAK_AUDIENCE/
      );
    });

    it("refuses the realm-wide audience without an azp allow-list", async () => {
      // Keycloak mints `account` into every token of the realm, so on its own
      // it accepts exactly what the audience option exists to reject.
      await expect(
        createVerifier({ audience: "account", allowedClients: "" })
      ).rejects.toThrow(/KEYCLOAK_ALLOWED_CLIENTS/);
    });

    it("allows the realm-wide audience once the allow-list is set", async () => {
      await expect(
        createVerifier({ audience: "account", allowedClients: "tedris-web" })
      ).resolves.toBeInstanceOf(JwtVerifierService);
    });
  });

  describe("signature and claims", () => {
    let verifier: JwtVerifierService;

    beforeAll(async () => {
      verifier = await createVerifier();
    });

    it("accepts a token with the expected issuer, audience and type", async () => {
      const decoded = await verifier.verifyToken(signRs256(validClaims()));

      expect(decoded.sub).toBe(SUBJECT);
      expect(decoded.aud).toBe(AUDIENCE);
    });

    it("rejects a token minted for another Keycloak client", async () => {
      // Same realm, same signing key — only `aud` differs.
      const token = signRs256(validClaims({ aud: "teskilat-api" }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /audience invalid/i
      );
    });

    it("rejects a token from another realm's issuer", async () => {
      const token = signRs256(
        validClaims({ iss: "https://keycloak.invalid/realms/other" })
      );

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /issuer invalid/i
      );
    });

    it("rejects an expired token", async () => {
      const iat = nowInSeconds() - 600;
      const token = signRs256(validClaims({ iat, exp: iat + 300 }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(/expired/i);
    });

    it("rejects a token that names no user", async () => {
      // Every ownership check downstream reads `request.user.sub`.
      const token = signRs256(validClaims({ sub: undefined }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /names no user/i
      );
    });

    it("rejects a token that carries no exp claim", async () => {
      // jsonwebtoken enforces exp when present but accepts a token without it.
      const token = signRs256(validClaims({ exp: undefined }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /never expires/i
      );
    });

    it("rejects an HS256 token signed with the published public key", async () => {
      await expect(
        verifier.verifyToken(signHs256(validClaims()))
      ).rejects.toThrow(/invalid algorithm/i);
    });

    it("rejects a token signed by a key that is not the realm's", async () => {
      const token = signRs256(validClaims(), otherKeyPair.privateKey);

      await expect(verifier.verifyToken(token)).rejects.toThrow(/signature/i);
    });

    it("rejects an ID token presented as an access token", async () => {
      const token = signRs256(validClaims({ typ: "ID" }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /not an access token/i
      );
    });

    it("rejects a token with no typ claim at all", async () => {
      const token = signRs256(validClaims({ typ: undefined }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /not an access token/i
      );
    });

    it("rejects a token whose header carries no kid", async () => {
      const claims = validClaims();
      const input = signingInput({ alg: "RS256", typ: "JWT" }, claims);
      const signature = createSign("RSA-SHA256")
        .update(input)
        .end()
        .sign(privateKey);

      await expect(
        verifier.verifyToken(`${input}.${base64url(signature)}`)
      ).rejects.toThrow(/key ID/i);
    });

    it("accepts a list of audiences and matches any one of them", async () => {
      // `account` in the list makes the allow-list mandatory, see above.
      const multi = await createVerifier({
        audience: "account,tedrisat-api",
        allowedClients: "tedris-web",
      });

      await expect(
        multi.verifyToken(signRs256(validClaims({ aud: "account" })))
      ).resolves.toMatchObject({ sub: SUBJECT });
    });
  });

  describe("the azp allow-list", () => {
    it("rejects a client outside the list", async () => {
      const verifier = await createVerifier({
        allowedClients: "tedris-web,nizam-web",
      });
      const token = signRs256(validClaims({ azp: "some-service-account" }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /may not call this API/i
      );
    });

    it("accepts a client inside the list", async () => {
      const verifier = await createVerifier({
        allowedClients: "tedris-web,nizam-web",
      });

      await expect(
        verifier.verifyToken(signRs256(validClaims({ azp: "nizam-web" })))
      ).resolves.toMatchObject({ azp: "nizam-web" });
    });

    it("imposes no azp restriction when the list is empty", async () => {
      const verifier = await createVerifier({ allowedClients: "" });

      await expect(
        verifier.verifyToken(signRs256(validClaims({ azp: "anything" })))
      ).resolves.toMatchObject({ sub: SUBJECT });
    });
  });
});

@Controller("guarded")
class GuardedController {
  @Get()
  @UseGuards(AuthGuard)
  read() {
    return { ok: true };
  }
}

describe("AuthGuard with the real verifier", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [() => keycloakConfig()],
          isGlobal: true,
        }),
      ],
      controllers: [GuardedController],
      providers: [
        { provide: PUBLIC_KEY_PROVIDER, useValue: keyProvider },
        { provide: JWT_VERIFIER, useClass: JwtVerifierService },
        AuthGuard,
      ],
    }).compile();

    app = await moduleRef.createNestApplication().init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("answers 401 to a token minted for a different client of the same realm", async () => {
    const token = signRs256(validClaims({ aud: "teskilat-api" }));

    await request(app.getHttpServer())
      .get("/guarded")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("answers 401 to an ID token", async () => {
    const token = signRs256(validClaims({ typ: "ID" }));

    await request(app.getHttpServer())
      .get("/guarded")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
  });

  it("lets a valid access token through", async () => {
    await request(app.getHttpServer())
      .get("/guarded")
      .set("Authorization", `Bearer ${signRs256(validClaims())}`)
      .expect(200, { ok: true });
  });
});
