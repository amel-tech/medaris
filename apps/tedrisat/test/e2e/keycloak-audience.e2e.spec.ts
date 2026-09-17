import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { IJwtVerifier, JWT_VERIFIER } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { createTestApp, startTestDatabase } from "../helpers/test-app.helper";

/**
 * MDRS-42. The realm half of the audience check MDRS-30 put in
 * `JwtVerifierService`.
 *
 * MDRS-30 proved the verifier rejects a wrong `aud`, with tokens it signed
 * itself. That can only show the check exists. It cannot show that the realm
 * mints the `aud` the API expects, and until this issue the realm did not:
 * `.env.example` shipped `KEYCLOAK_AUDIENCE=account`, the one audience Keycloak
 * puts into every token. This spec closes that gap against a real Keycloak:
 *
 *   1. `tools/keycloak/setup-realm.sh` builds the realm, and a second run
 *      creates nothing.
 *   2. A web client requires PKCE, as the script configures it.
 *   3. A user logs in through `tedris-dev` exactly as NextAuth does
 *      (authorization code + PKCE + client secret). The access token carries
 *      `aud: tedrisat-api`, and the API — with the real AuthGuard,
 *      `KeycloakPublicKeyProvider` and `KEYCLOAK_AUDIENCE=tedrisat-api` —
 *      accepts it.
 *   4. The same login through a client with no audience mapper yields a
 *      token the API rejects with 401.
 *
 * In case 4 the probe client is on the `azp` allow-list on purpose. Otherwise
 * the `azp` check would reject the token too, and the 401 would not prove the
 * audience check did it.
 */

const KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak:26.3.2";
const REALM = "amel-tech-dev";
const API_CLIENT_ID = "tedrisat-api";
const WEB_ORIGIN = "http://localhost:4000";
const REDIRECT_URI = `${WEB_ORIGIN}/api/auth/callback/keycloak`;
const PROBE_CLIENT_ID = "unmapped-probe";
const SETUP_SCRIPT = join(
  __dirname,
  "../../../../tools/keycloak/setup-realm.sh"
);

describe("Keycloak realm ↔ audience check (e2e)", () => {
  let keycloak: StartedTestContainer;
  let kcUrl: string;
  let app: INestApplication;
  let firstRun: string;

  const runSetup = () =>
    execFileSync("bash", [SETUP_SCRIPT, "--with-test-users"], {
      env: {
        ...process.env,
        KC_URL: kcUrl,
        WEB_CLIENTS: `tedris-dev=${WEB_ORIGIN}`,
      },
      encoding: "utf8",
    });

  const adminToken = async () => {
    const response = await fetch(
      `${kcUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "password",
          client_id: "admin-cli",
          username: "admin",
          password: "admin",
        }),
      }
    );
    return ((await response.json()) as { access_token: string }).access_token;
  };

  const adminApi = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${kcUrl}/admin/realms/${REALM}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await adminToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`${method} ${path} → ${response.status}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };

  const clientSecret = async (clientId: string): Promise<string> => {
    const [client] = await adminApi(
      "GET",
      `/clients?clientId=${encodeURIComponent(clientId)}`
    );
    return (await adminApi("GET", `/clients/${client.id}/client-secret`)).value;
  };

  /**
   * Authorization code + PKCE (S256) + client secret — the flow next-auth's
   * Keycloak provider runs (`checks: ["pkce", "state"]`). Returns the access
   * token. Cookies are carried by hand because `fetch` keeps no jar.
   */
  const login = async (clientId: string, username: string) => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authUrl =
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/auth?` +
      new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        scope: "openid",
        redirect_uri: REDIRECT_URI,
        state: "mdrs-42",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

    const page = await fetch(authUrl, { redirect: "manual" });
    const cookies = page.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const html = await page.text();
    const action = html.match(/action="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    if (!action) throw new Error(`no login form for ${clientId}`);

    const submitted = await fetch(action, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: cookies },
      body: new URLSearchParams({ username, password: username }),
    });
    const location = submitted.headers.get("location") ?? "";
    const code = new URL(location).searchParams.get("code");
    if (!code) throw new Error(`login through ${clientId} gave ${location}`);

    const tokens = await fetch(
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: await clientSecret(clientId),
          code,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI,
        }),
      }
    );
    return ((await tokens.json()) as { access_token: string }).access_token;
  };

  const claims = (token: string) =>
    JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

  beforeAll(async () => {
    keycloak = await new GenericContainer(KEYCLOAK_IMAGE)
      .withEnvironment({
        KC_BOOTSTRAP_ADMIN_USERNAME: "admin",
        KC_BOOTSTRAP_ADMIN_PASSWORD: "admin",
      })
      .withCommand(["start-dev"])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/realms/master", 8080))
      .withStartupTimeout(180_000)
      .start();
    // `localhost`, not the container host's IP: the issuer Keycloak stamps is
    // the host the request used, and every request below has to agree on it.
    kcUrl = `http://localhost:${keycloak.getMappedPort(8080)}`;

    firstRun = runSetup();

    // The probe: shaped like a web client, deliberately without the mapper.
    await adminApi("POST", "/clients", {
      clientId: PROBE_CLIENT_ID,
      enabled: true,
      publicClient: false,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: [`${WEB_ORIGIN}/*`],
      attributes: { "pkce.code.challenge.method": "S256" },
    });

    // The Postgres container sets placeholder KEYCLOAK_* values; they are
    // replaced after it starts and before AppModule is first imported, which
    // is when `configuration()` reads them.
    await startTestDatabase();
    process.env.KEYCLOAK_JWKS_URL = `${kcUrl}/realms/${REALM}/protocol/openid-connect/certs`;
    process.env.KEYCLOAK_ISSUER = `${kcUrl}/realms/${REALM}`;
    process.env.KEYCLOAK_AUDIENCE = API_CLIENT_ID;
    process.env.KEYCLOAK_ALLOWED_CLIENTS = `tedris-dev,${PROBE_CLIENT_ID}`;

    // No authUserId: the real AuthGuard is mounted.
    app = await createTestApp();
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await keycloak?.stop();
  });

  it("creates the realm, the API client and the web client on the first run", () => {
    expect(firstRun).toContain("realm amel-tech-dev\n      created");
    expect(firstRun).toContain("API client tedrisat-api\n      created");
    expect(firstRun).toContain("tedris-dev created");
    expect(firstRun).toContain("audience mapper created");
  });

  it("changes nothing on a second run", () => {
    const secondRun = runSetup();

    expect(secondRun).not.toContain("created");
    expect(secondRun.match(/exists/g)?.length).toBe(6);
  });

  it("requires PKCE on the web client", async () => {
    const response = await fetch(
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/auth?` +
        new URLSearchParams({
          client_id: "tedris-dev",
          response_type: "code",
          scope: "openid",
          redirect_uri: REDIRECT_URI,
        }),
      { redirect: "manual" }
    );

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });

  it("mints aud tedrisat-api for a web-client login, and the API accepts it", async () => {
    const token = await login("tedris-dev", "owner-user");

    expect(claims(token)).toMatchObject({
      aud: expect.arrayContaining([API_CLIENT_ID]),
      azp: "tedris-dev",
      typ: "Bearer",
    });

    const response = await request(app.getHttpServer())
      .get("/flashcard/decks/collections")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("rejects with 401 a token from a client without the audience mapper", async () => {
    const token = await login(PROBE_CLIENT_ID, "owner-user");

    expect(claims(token).aud).not.toContain(API_CLIENT_ID);

    const response = await request(app.getHttpServer())
      .get("/flashcard/decks/collections")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    // AuthGuard answers every failure with a bare 401 and keeps the reason
    // to itself, so the reason is read from the verifier the guard delegates to.
    await expect(
      app.get<IJwtVerifier>(JWT_VERIFIER).verifyToken(token)
    ).rejects.toThrow(/jwt audience invalid/);
  });
});
