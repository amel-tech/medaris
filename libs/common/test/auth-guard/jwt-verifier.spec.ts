import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  type CryptoKey,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  type JWK,
  SignJWT,
} from "jose";
import {
  AuthGuardModule,
  type IJwtVerifier,
  JWT_VERIFIER,
  JwtClaimError,
  JwtDecodeError,
  JwtMissingKidError,
  JwtTokenVerifier,
  JwtVerificationError,
  JwtVerifierService,
  KeyNotFoundError,
  loadJwtClaimPolicy,
  REFUSED_CLIENT_SOURCE,
} from "../../src";
import { KeycloakPublicKeyProvider } from "../../src/auth-guard/key-providers/keycloak-public-key-provider";

/**
 * Auth audit C5: the API verifies access tokens with jose against the IdP's
 * JSON Web Key Set, for any listed algorithm, instead of `jsonwebtoken` with
 * a PEM cut from each key's `x5c` certificate (RS256 only).
 *
 * The JWKS is served from loopback by this file, and the keys in it are
 * exported by jose, so none carries an `x5c`: before C5 such a set made every
 * lookup throw. The verifier is the real one on top of the real
 * `KeycloakPublicKeyProvider`; only the URL is local.
 */

const ISSUER = "https://idp.invalid/realms/medaris";
const AUDIENCE = "tedrisat-api";
const SUBJECT = "623fdf08-fd0e-481b-a927-4a1c15135e62";
const CLIENT = "tedris-web";

interface SigningKey {
  alg: string;
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  jwk: JWK;
}

async function signingKey(alg: string, kid: string): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair(alg);
  const jwk = { ...(await exportJWK(publicKey)), kid, alg, use: "sig" };
  return { alg, kid, privateKey, publicKey, jwk };
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

type Claims = Record<string, unknown>;

/** A Keycloak-shaped access token for this API. */
function validClaims(overrides: Claims = {}): Claims {
  const iat = nowInSeconds();
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: SUBJECT,
    typ: "Bearer",
    azp: CLIENT,
    iat,
    exp: iat + 300,
    ...overrides,
  };
}

function sign(
  key: SigningKey,
  claims: Claims = validClaims(),
  header: Record<string, unknown> = {}
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: "JWT", ...header })
    .sign(key.privateKey);
}

function keycloakConfig(overrides: Record<string, unknown> = {}) {
  return {
    keycloak: {
      jwksUrl,
      issuer: ISSUER,
      audience: AUDIENCE,
      allowedClients: `${CLIENT},nizam-web`,
      ...overrides,
    },
  };
}

let rsa: SigningKey;
let ec: SigningKey;
let ed: SigningKey;
let jwks: { keys: JWK[] };
let jwksUrl: string;
let jwksRequests = 0;
let server: Server;

beforeAll(async () => {
  rsa = await signingKey("RS256", "rsa-1");
  ec = await signingKey("ES256", "ec-1");
  ed = await signingKey("EdDSA", "ed-1");
  // An encryption key, as Keycloak publishes one next to its signing key. It
  // must be passed over, not break the lookup.
  const enc = await generateKeyPair("RSA-OAEP");
  jwks = {
    keys: [
      rsa.jwk,
      ec.jwk,
      ed.jwk,
      {
        ...(await exportJWK(enc.publicKey)),
        kid: "enc-1",
        alg: "RSA-OAEP",
        use: "enc",
      },
    ],
  };

  server = createServer((request, response) => {
    jwksRequests += 1;
    if (request.url !== "/certs") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(jwks));
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  const { port } = server.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${port}/certs`;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

async function createVerifier(
  overrides: Record<string, unknown> = {}
): Promise<JwtVerifierService> {
  const config = new ConfigService(keycloakConfig(overrides));
  const provider = new KeycloakPublicKeyProvider(config);
  await provider.onModuleInit();
  return new JwtVerifierService(provider, config);
}

describe("JwtVerifierService with jose and a served JWKS (auth audit C5)", () => {
  let verifier: JwtVerifierService;

  beforeAll(async () => {
    verifier = await createVerifier();
  });

  describe.each([
    ["RS256", () => rsa],
    ["ES256", () => ec],
    ["EdDSA", () => ed],
  ])("a token signed with %s", (_alg, key) => {
    it("is accepted, and its payload returned", async () => {
      await expect(verifier.verifyToken(await sign(key()))).resolves.toEqual(
        expect.objectContaining({ sub: SUBJECT, azp: CLIENT, aud: AUDIENCE })
      );
    });

    it("is refused from another issuer", async () => {
      const token = await sign(
        key(),
        validClaims({ iss: "https://idp.invalid/realms/other" })
      );

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /unexpected "iss" claim value/
      );
    });

    it("is refused for another audience", async () => {
      const token = await sign(key(), validClaims({ aud: "teskilat-api" }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /unexpected "aud" claim value/
      );
    });

    it("is refused for a client outside the allow-list", async () => {
      const token = await sign(key(), validClaims({ azp: "other-service" }));

      const rejection = verifier.verifyToken(token);
      await expect(rejection).rejects.toBeInstanceOf(JwtClaimError);
      await expect(rejection).rejects.toThrow(/may not call this API/);
    });

    it("is refused once expired, with no clock tolerance", async () => {
      const iat = nowInSeconds() - 600;
      const token = await sign(key(), validClaims({ iat, exp: iat + 599 }));

      const rejection = verifier.verifyToken(token);
      await expect(rejection).rejects.toBeInstanceOf(JwtVerificationError);
      await expect(rejection).rejects.toThrow(/ERR_JWT_EXPIRED/);
    });

    it("is refused when it is an ID token", async () => {
      const token = await sign(key(), validClaims({ typ: "ID" }));

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /not an access token: typ is "ID"/
      );
    });

    it("is refused under a kid the JWKS does not have", async () => {
      const token = await sign(key(), validClaims(), { kid: "rotated-away" });

      await expect(verifier.verifyToken(token)).rejects.toBeInstanceOf(
        KeyNotFoundError
      );
    });
  });

  describe("the algorithm allow-list", () => {
    it("refuses HS256 keyed with the published public key", async () => {
      // The algorithm-confusion attack: the realm's RSA key is published in
      // the JWKS, so an attacker can use its PEM as an HMAC secret.
      const secret = new TextEncoder().encode(await exportSPKI(rsa.publicKey));
      const token = await new SignJWT(validClaims())
        .setProtectedHeader({ alg: "HS256", kid: rsa.kid })
        .sign(secret);

      await expect(verifier.verifyToken(token)).rejects.toThrow(
        /ERR_JOSE_ALG_NOT_ALLOWED/
      );
    });

    it("refuses an asymmetric algorithm that is not listed", async () => {
      const rs384 = await signingKey("RS384", rsa.kid);

      await expect(verifier.verifyToken(await sign(rs384))).rejects.toThrow(
        /ERR_JOSE_ALG_NOT_ALLOWED/
      );
    });

    it("refuses an alg that does not fit the key under that kid", async () => {
      // EdDSA claimed under the RSA key's kid: jose only takes a key of the
      // type the alg names, so there is no key to verify with.
      const token = await sign(ed, validClaims(), { kid: rsa.kid });

      await expect(verifier.verifyToken(token)).rejects.toBeInstanceOf(
        KeyNotFoundError
      );
    });

    it("refuses a token signed by a key that is not in the JWKS", async () => {
      const stranger = await signingKey("EdDSA", ed.kid);

      await expect(verifier.verifyToken(await sign(stranger))).rejects.toThrow(
        /ERR_JWS_SIGNATURE_VERIFICATION_FAILED/
      );
    });
  });

  describe("before any key is looked up", () => {
    it("refuses a token whose header carries no kid", async () => {
      const token = await new SignJWT(validClaims())
        .setProtectedHeader({ alg: "EdDSA" })
        .sign(ed.privateKey);

      await expect(verifier.verifyToken(token)).rejects.toBeInstanceOf(
        JwtMissingKidError
      );
    });

    it("refuses something that is not a JWT", async () => {
      await expect(verifier.verifyToken("not-a-jwt")).rejects.toBeInstanceOf(
        JwtDecodeError
      );
    });
  });

  it("does not fetch the JWKS again for an unknown kid inside the cooldown", async () => {
    // KEYCLOAK_NOT_FOUND_CACHE_TTL (120 s by default) is jose's cooldown: the
    // set fetched at boot is recent, so a made-up kid costs no request.
    const fresh = await createVerifier();
    const before = jwksRequests;

    for (const kid of ["made-up-1", "made-up-2", "made-up-3"]) {
      const token = await sign(rsa, validClaims(), { kid });
      await expect(fresh.verifyToken(token)).rejects.toBeInstanceOf(
        KeyNotFoundError
      );
    }

    expect(jwksRequests).toBe(before);
  });

  it("imposes no client restriction when the allow-list is empty", async () => {
    const open = await createVerifier({ allowedClients: "" });
    const token = await sign(ed, validClaims({ azp: "anything" }));

    await expect(open.verifyToken(token)).resolves.toMatchObject({
      sub: SUBJECT,
    });
  });

  describe("refused clients (partner enrollments)", () => {
    it("refuses a refused client even when the allow-list is empty", async () => {
      // A partner application's service account carries this API's audience;
      // with no allow-list only the refusal keeps its token off these routes.
      const open = await createVerifier({
        allowedClients: "",
        refusedClients: "ornek-uygulama",
      });
      const partner = await sign(ed, validClaims({ azp: "ornek-uygulama" }));

      const rejection = open.verifyToken(partner);
      await expect(rejection).rejects.toBeInstanceOf(JwtClaimError);
      await expect(rejection).rejects.toThrow(/tokens these routes refuse/);
      await expect(
        open.verifyToken(await sign(ed, validClaims({ azp: "anything" })))
      ).resolves.toMatchObject({ sub: SUBJECT });
    });

    it("refuses to start when a client is both allowed and refused", async () => {
      await expect(
        createVerifier({
          allowedClients: `${CLIENT},ornek-uygulama`,
          refusedClients: "ornek-uygulama",
        })
      ).rejects.toThrow(/both allow and refuse the client "ornek-uygulama"/);
    });

    it("verifies with a policy of its own on the same key provider", async () => {
      // What the partner guard builds: the same keys, its own clients.
      const config = new ConfigService(keycloakConfig());
      const provider = new KeycloakPublicKeyProvider(config);
      await provider.onModuleInit();
      const partnerOnly = new JwtTokenVerifier(provider, {
        ...loadJwtClaimPolicy(config),
        allowedClients: ["ornek-uygulama"],
        refusedClients: [],
      });

      await expect(
        partnerOnly.verifyToken(
          await sign(rsa, validClaims({ azp: "ornek-uygulama" }))
        )
      ).resolves.toMatchObject({ azp: "ornek-uygulama" });
      await expect(
        partnerOnly.verifyToken(await sign(rsa, validClaims()))
      ).rejects.toThrow(/may not call this API: azp is "tedris-web"/);
    });

    it("refuses a client its refused-client source names, asked per token", async () => {
      // The partner registry: rows the başnazım adds while the API runs.
      const config = new ConfigService(keycloakConfig({ allowedClients: "" }));
      const provider = new KeycloakPublicKeyProvider(config);
      await provider.onModuleInit();
      const registered = new Set<string>();
      const asked: string[] = [];
      const verifier = new JwtVerifierService(provider, config, {
        isRefused: async (clientId) => {
          asked.push(clientId);
          return registered.has(clientId);
        },
      });
      const partner = await sign(ed, validClaims({ azp: "ornek-uygulama" }));

      await expect(verifier.verifyToken(partner)).resolves.toMatchObject({
        azp: "ornek-uygulama",
      });
      registered.add("ornek-uygulama");
      await expect(verifier.verifyToken(partner)).rejects.toThrow(
        /tokens these routes refuse: azp is "ornek-uygulama"/
      );
      await expect(
        verifier.verifyToken(await sign(ed, validClaims()))
      ).resolves.toMatchObject({ azp: CLIENT });
      expect(asked).toEqual(["ornek-uygulama", "ornek-uygulama", CLIENT]);
    });

    it("refuses the token when the source cannot tell", async () => {
      const config = new ConfigService(keycloakConfig({ allowedClients: "" }));
      const provider = new KeycloakPublicKeyProvider(config);
      await provider.onModuleInit();
      const verifier = new JwtVerifierService(provider, config, {
        isRefused: async () => {
          throw new Error("database unavailable");
        },
      });

      const rejection = verifier.verifyToken(await sign(ed, validClaims()));
      await expect(rejection).rejects.toBeInstanceOf(JwtClaimError);
      await expect(rejection).rejects.toThrow(/database unavailable/);
    });
  });
});

describe("AuthGuardModule wiring", () => {
  it("resolves the verifier and its JWKS provider through Nest DI", async () => {
    // The useImportType trap (AGENTS.md): an `import type` on a constructor
    // parameter breaks injection while typecheck stays green. Booting the
    // module and verifying through it is what would show it.
    @Module({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [() => keycloakConfig()],
        }),
        AuthGuardModule,
      ],
    })
    class WiringModule {}

    const context = await NestFactory.createApplicationContext(WiringModule, {
      abortOnError: false,
      logger: false,
    });

    try {
      const verifier = context.get<IJwtVerifier>(JWT_VERIFIER);
      await expect(verifier.verifyToken(await sign(ed))).resolves.toMatchObject(
        { sub: SUBJECT }
      );
    } finally {
      await context.close();
    }
  });

  it("hands the verifier a refused-client source a global module provides", async () => {
    // How tedrisat refuses its partner applications on every route behind
    // AuthGuard: AuthGuardModule is imported by many modules, and a global
    // module's export is the one provider all of them see.
    @Global()
    @Module({
      providers: [
        {
          provide: REFUSED_CLIENT_SOURCE,
          useValue: { isRefused: async (id: string) => id === CLIENT },
        },
      ],
      exports: [REFUSED_CLIENT_SOURCE],
    })
    class RegistryModule {}

    @Module({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [() => keycloakConfig({ allowedClients: "" })],
        }),
        RegistryModule,
        AuthGuardModule,
      ],
    })
    class WiringModule {}

    const context = await NestFactory.createApplicationContext(WiringModule, {
      abortOnError: false,
      logger: false,
    });

    try {
      const verifier = context.get<IJwtVerifier>(JWT_VERIFIER);
      await expect(verifier.verifyToken(await sign(ed))).rejects.toThrow(
        /tokens these routes refuse/
      );
      await expect(
        verifier.verifyToken(await sign(ed, validClaims({ azp: "nazar-web" })))
      ).resolves.toMatchObject({ sub: SUBJECT });
    } finally {
      await context.close();
    }
  });
});
