import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { integrationPartnerKosks } from "../../src/database/schema/integration-partner.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { partnerCourseCodes } from "../../src/database/schema/partner-enrollment.schema";
import {
  createTestApp,
  useDatabaseForThisFile,
} from "../helpers/test-app.helper";

/**
 * Partner enrollments against a real Keycloak, built by the local realm set-up
 * (`tools/keycloak/setup-realm.sh`, as keycloak-audience.e2e.spec.ts does):
 * the `partner-enrollment` realm role and the example partner client
 * `ornek-uygulama`, whose service account holds it and whose tokens carry
 * `tedrisat-api`. tedrisat runs with the real key provider and verifier, the
 * front-ends' allow-list (`KEYCLOAK_ALLOWED_CLIENTS=tedris-dev`), the partner
 * registered at boot from `INTEGRATION_PARTNERS` (the seeding that carries a
 * deployment's partner into `integration_partners`) and bound to the köşk
 * below, and a service account of its own with `view-users` for checking the
 * person's account.
 *
 * partner-enrollment.e2e.spec.ts covers every rule with signed test tokens;
 * this proves the realm mints what the guard accepts, and refuses what it
 * must, end to end. The last tests provision the same partner from the
 * configuration package (config/keycloak/, `provision local`) into a second
 * realm, and check what a person's ID token through it carries: the names,
 * the e-mail address and the gender, never the user name or the locale.
 */

// Must track `run-keycloak` in apps/keycloak-theme/package.json, as in
// keycloak-audience.e2e.spec.ts.
const KEYCLOAK_IMAGE =
  process.env.KEYCLOAK_IMAGE ?? "quay.io/keycloak/keycloak:26.3.2";
const REALM = "amel-tech-dev";
const API_CLIENT_ID = "tedrisat-api";
const PARTNER_ID = "ornek-uygulama";
const ADMIN_CLIENT_ID = "tedrisat-admin";
const WEB_ORIGIN = "http://localhost:4000";
const REDIRECT_URI = `${WEB_ORIGIN}/api/auth/callback/keycloak`;
const SETUP_SCRIPT = join(
  __dirname,
  "../../../../tools/keycloak/setup-realm.sh"
);
const PACKAGE_SCRIPTS = join(__dirname, "../../../../config/keycloak/scripts");
// The realm `provision local` builds, beside REALM.
const PACKAGE_REALM = "medaris";
const NAZIM = "e0000000-0000-4000-8000-000000000001";

describe("Partner enrollments against Keycloak (e2e)", () => {
  let keycloak: StartedTestContainer;
  let kcUrl: string;
  let app: INestApplication;
  let db: DatabaseService["db"];
  let firstRun: string;
  let courseId: string;
  let openCourseId: string;
  const ids: Record<string, string> = {};

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

  const adminApi = async (
    method: string,
    path: string,
    body?: unknown,
    realm = REALM
  ) => {
    const response = await fetch(`${kcUrl}/admin/realms/${realm}${path}`, {
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

  const clientOf = async (clientId: string, realm = REALM) =>
    (
      await adminApi(
        "GET",
        `/clients?clientId=${encodeURIComponent(clientId)}`,
        undefined,
        realm
      )
    )[0] as { id: string; consentRequired: boolean };

  const clientSecret = async (clientId: string, realm = REALM) =>
    (
      await adminApi(
        "GET",
        `/clients/${(await clientOf(clientId, realm)).id}/client-secret`,
        undefined,
        realm
      )
    ).value as string;

  /** The partner's service-account token: the client credentials grant. */
  const partnerToken = async (realm = REALM) => {
    const response = await fetch(
      `${kcUrl}/realms/${realm}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: PARTNER_ID,
          client_secret: await clientSecret(PARTNER_ID, realm),
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`client credentials → ${response.status}`);
    }
    return ((await response.json()) as { access_token: string }).access_token;
  };

  /** A person's login through tedris-dev, as keycloak-audience.e2e.spec.ts logs in. */
  const login = async (username: string) => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const page = await fetch(
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/auth?${new URLSearchParams(
        {
          client_id: "tedris-dev",
          response_type: "code",
          scope: "openid",
          redirect_uri: REDIRECT_URI,
          state: "partner",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }
      )}`,
      { redirect: "manual" }
    );
    const cookies = page.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const html = await page.text();
    const action = html.match(/action="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    if (!action) throw new Error("no login form");
    const submitted = await fetch(action, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: cookies },
      body: new URLSearchParams({ username, password: username }),
    });
    const location = submitted.headers.get("location");
    const code = location ? new URL(location).searchParams.get("code") : null;
    if (!code) throw new Error(`login of ${username} gave ${location}`);
    const tokens = await fetch(
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "tedris-dev",
          client_secret: await clientSecret("tedris-dev"),
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

  const http = () => request(app.getHttpServer());
  const put = (ref: string, code: string, userId: string, token: string) =>
    http()
      .put(`/integrations/enrollments/${ref}/${code}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId });
  const seatOf = async (userId: string, course: string) =>
    (
      await db
        .select()
        .from(enrollments)
        .where(
          and(eq(enrollments.userId, userId), eq(enrollments.courseId, course))
        )
    )[0] ?? null;

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
    kcUrl = `http://localhost:${keycloak.getMappedPort(8080)}`;

    firstRun = execFileSync("bash", [SETUP_SCRIPT, "--with-test-users"], {
      env: {
        ...process.env,
        KC_URL: kcUrl,
        WEB_CLIENTS: `tedris-dev=${WEB_ORIGIN}`,
        KC_SMTP_HOST: "",
      },
      encoding: "utf8",
      stdio: "pipe",
    });

    // tedrisat's own service account, with the read right it already has in
    // every environment and nothing more (`view-users`).
    await adminApi("POST", "/clients", {
      clientId: ADMIN_CLIENT_ID,
      enabled: true,
      publicClient: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
    });
    const adminClient = await clientOf(ADMIN_CLIENT_ID);
    const account = await adminApi(
      "GET",
      `/clients/${adminClient.id}/service-account-user`
    );
    const management = await clientOf("realm-management");
    const viewUsers = await adminApi(
      "GET",
      `/clients/${management.id}/roles/view-users`
    );
    await adminApi(
      "POST",
      `/users/${account.id}/role-mappings/clients/${management.id}`,
      [viewUsers]
    );

    await adminApi("POST", "/users", {
      username: "unverified-user",
      enabled: true,
      emailVerified: false,
      email: "unverified-user@example.test",
      firstName: "Unverified",
      lastName: "Test",
    });
    for (const username of ["owner-user", "stranger-user", "unverified-user"]) {
      const [user] = await adminApi(
        "GET",
        `/users?exact=true&username=${username}`
      );
      ids[username] = user.id;
    }

    await useDatabaseForThisFile();
    process.env.KEYCLOAK_JWKS_URL = `${kcUrl}/realms/${REALM}/protocol/openid-connect/certs`;
    process.env.KEYCLOAK_ISSUER = `${kcUrl}/realms/${REALM}`;
    process.env.KEYCLOAK_AUDIENCE = API_CLIENT_ID;
    process.env.KEYCLOAK_ALLOWED_CLIENTS = "tedris-dev";
    process.env.INTEGRATION_PARTNERS = `${PARTNER_ID}=Örnek Uygulama`;
    process.env.KEYCLOAK_ADMIN_CLIENT_ID = ADMIN_CLIENT_ID;
    process.env.KEYCLOAK_ADMIN_CLIENT_SECRET =
      await clientSecret(ADMIN_CLIENT_ID);
    app = await createTestApp({ keyProvider: "real" });
    db = app.get<DatabaseService>(DatabaseService).db;

    const [kosk] = await db
      .insert(kosks)
      .values({ ownerId: NAZIM, name: "Örnek Köşkü" })
      .returning();
    const rows = await db
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: NAZIM,
          title: "Tecvid",
          status: CourseStatus.PUBLISHED,
          requiresApproval: true,
        },
        {
          koskId: kosk.id,
          authorId: NAZIM,
          title: "Nahiv",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    [courseId, openCourseId] = rows.map((row) => row.id);
    // Seeded at boot with no code mapped yet, so bound to no köşk: bound here
    // as the başnazım binds it in nizam.
    await db
      .insert(integrationPartnerKosks)
      .values({ clientId: PARTNER_ID, koskId: kosk.id });
    await db.insert(partnerCourseCodes).values([
      {
        partnerClientId: PARTNER_ID,
        code: "tecvid",
        courseId,
        createdBy: NAZIM,
      },
      {
        partnerClientId: PARTNER_ID,
        code: "nahiv",
        courseId: openCourseId,
        createdBy: NAZIM,
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await keycloak?.stop();
  });

  it("builds the role and the example partner client", async () => {
    expect(firstRun).toContain(
      "partner role partner-enrollment\n      created"
    );
    expect(firstRun).toContain(`${PARTNER_ID} created (https://ornek.example)`);
    expect(firstRun).toContain("service account role created");
    expect(firstRun).toContain("role scope created");
    expect((await clientOf(PARTNER_ID)).consentRequired).toBe(true);
  });

  it("mints a client-credentials token with tedrisat's audience and the role", async () => {
    const token = claims(await partnerToken());
    expect([token.aud].flat()).toContain(API_CLIENT_ID);
    expect(token).toMatchObject({
      azp: PARTNER_ID,
      typ: "Bearer",
      // Full scope off: the role is the only one the token names.
      realm_access: { roles: ["partner-enrollment"] },
    });
  });

  it("enrols the person once, and says so again", async () => {
    const token = await partnerToken();
    const owner = ids["owner-user"];

    await put("R-1", "tecvid", owner, token).expect(200, {
      status: "ENROLLED",
      courseId,
    });
    expect((await seatOf(owner, courseId))?.status).toBe(
      EnrollmentStatus.ENROLLED
    );
    await put("R-1", "tecvid", owner, token).expect(200, {
      status: "ALREADY_ENROLLED",
      courseId,
    });
  });

  it("answers 404 for an unknown code and 409 for another person on the same registration", async () => {
    const token = await partnerToken();
    const unknown = await put(
      "R-1",
      "bilinmeyen",
      ids["owner-user"],
      token
    ).expect(404);
    expect(unknown.body.code).toBe("PARTNER_COURSE_UNKNOWN");
    const other = await put(
      "R-1",
      "tecvid",
      ids["stranger-user"],
      token
    ).expect(409);
    expect(other.body.code).toBe("PARTNER_REGISTRATION_USER_MISMATCH");
  });

  it("reads the account from the realm: an unverified e-mail is refused", async () => {
    const res = await put(
      "R-3",
      "tecvid",
      ids["unverified-user"],
      await partnerToken()
    ).expect(409);
    expect(res.body.code).toBe("PARTNER_USER_UNVERIFIED");
  });

  it("takes away what it added and keeps a seat the person took on their own", async () => {
    const token = await partnerToken();
    const stranger = ids["stranger-user"];
    await http()
      .post(`/courses/${openCourseId}/enroll`)
      .set("Authorization", `Bearer ${await login("stranger-user")}`)
      .expect(201);

    await put("R-2", "nahiv", stranger, token).expect(200, {
      status: "ALREADY_ENROLLED",
      courseId: openCourseId,
    });
    await http()
      .delete("/integrations/enrollments/R-2/nahiv")
      .set("Authorization", `Bearer ${token}`)
      .expect(200, { status: "KEPT" });
    expect((await seatOf(stranger, openCourseId))?.status).toBe(
      EnrollmentStatus.ENROLLED
    );

    await http()
      .delete("/integrations/enrollments/R-1/tecvid")
      .set("Authorization", `Bearer ${token}`)
      .expect(200, { status: "REMOVED" });
    expect((await seatOf(ids["owner-user"], courseId))?.status).toBe(
      EnrollmentStatus.REVOKED
    );
  });

  it("refuses a person's token on /integrations/*, and the partner's token on an ordinary route", async () => {
    const person = await login("owner-user");
    expect(claims(person).aud).toEqual(expect.arrayContaining([API_CLIENT_ID]));
    await put("R-9", "tecvid", ids["owner-user"], person).expect(401);
    await http()
      .get("/integrations/courses")
      .set("Authorization", `Bearer ${person}`)
      .expect(401);
    // The person's token does pass where it belongs.
    await http()
      .get("/flashcard/decks/collections")
      .set("Authorization", `Bearer ${person}`)
      .expect(200);

    const partner = await partnerToken();
    for (const path of [
      "/flashcard/decks/collections",
      "/nizam/partner-applications",
      "/me",
    ]) {
      await http()
        .get(path)
        .set("Authorization", `Bearer ${partner}`)
        .expect(401);
    }
  });

  /**
   * One of the configuration package's scripts against PACKAGE_REALM, with
   * whatever the developer's shell exports for them (KC_*, ALLOW_*) dropped.
   */
  const packageScript = (script: "provision" | "verify") => {
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/^(KC_|ALLOW_)/.test(key))
    );
    return spawnSync("bash", [join(PACKAGE_SCRIPTS, script), "local"], {
      env: {
        ...env,
        KC_URL: kcUrl,
        KC_REALM: PACKAGE_REALM,
        KC_SMTP_HOST: "",
      },
      encoding: "utf8",
    });
  };

  it("provisions the same partner from the configuration package", async () => {
    const provision = () => packageScript("provision");

    const first = provision();
    expect(first.status, first.stderr).toBe(0);
    // The realm is created whole, its roles with it.
    expect(first.stdout).toContain("realm medaris: created");
    expect(first.stdout).toContain("role partner-enrollment: in sync");
    expect(first.stdout).toContain("client scope full-name: created");
    expect(first.stdout).toContain(`client ${PARTNER_ID}: created`);
    for (const kind of ["serviceAccountRealmRoles", "scopeRealmRoles"]) {
      expect(first.stdout).toContain(
        `client ${PARTNER_ID} ${kind} partner-enrollment: created`
      );
    }
    // Without the `roles` scope (removed below), the client's own mapper
    // still names the role.
    const token = claims(await partnerToken(PACKAGE_REALM));
    expect([token.aud].flat()).toContain(API_CLIENT_ID);
    expect(token).toMatchObject({
      azp: PARTNER_ID,
      realm_access: { roles: ["partner-enrollment"] },
    });

    const second = provision();
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain(
      `client ${PARTNER_ID} serviceAccountRealmRoles partner-enrollment: in sync`
    );
    expect(second.stdout).toContain(
      "provision: done (0 difference(s) applied)"
    );
  });

  /**
   * The provisioned partner's client scopes: `full-name`, `email` and
   * `gender` by default, and in neither list the scopes that carry the user
   * name (`profile`, `microprofile-jwt`) nor `roles`, whose place the
   * client's own `realm-roles` mapper takes.
   */
  const partnerScopes = async () => {
    const { id } = await clientOf(PARTNER_ID, PACKAGE_REALM);
    const client = (await adminApi(
      "GET",
      `/clients/${id}`,
      undefined,
      PACKAGE_REALM
    )) as { defaultClientScopes: string[]; optionalClientScopes: string[] };
    return {
      default: client.defaultClientScopes,
      optional: client.optionalClientScopes,
    };
  };

  it("gives the provisioned partner full-name, email and gender, and not profile", async () => {
    const scopes = await partnerScopes();
    expect(scopes.default).toEqual(
      expect.arrayContaining(["full-name", "email", "gender"])
    );
    for (const scope of ["profile", "microprofile-jwt", "roles"]) {
      expect(scopes.default).not.toContain(scope);
      expect(scopes.optional).not.toContain(scope);
    }
    // Every client created from now on is offered full-name, as gender.
    const offered = (await adminApi(
      "GET",
      "/default-optional-client-scopes",
      undefined,
      PACKAGE_REALM
    )) as { name: string }[];
    expect(offered.map((scope) => scope.name)).toEqual(
      expect.arrayContaining(["gender", "full-name"])
    );
  });

  it("puts a person's names, e-mail and gender into the partner's ID token, and no user name or locale", async () => {
    await adminApi(
      "POST",
      "/users",
      {
        username: "ornek-kisi",
        enabled: true,
        emailVerified: true,
        email: "ornek-kisi@example.test",
        firstName: "Ayşe",
        lastName: "Yılmaz",
        attributes: { gender: ["FEMALE"], locale: ["ar"] },
      },
      PACKAGE_REALM
    );
    const [person] = await adminApi(
      "GET",
      "/users?exact=true&username=ornek-kisi",
      undefined,
      PACKAGE_REALM
    );
    // The ID token Keycloak would issue this client for this person and
    // these scopes (the admin console's Client scopes → Evaluate): the same
    // mappers as a sign-in, without a browser or the consent page.
    const idToken = async (clientId: string, scope: string) => {
      const { id } = await clientOf(clientId, PACKAGE_REALM);
      const query = new URLSearchParams({ scope, userId: person.id });
      return (await adminApi(
        "GET",
        `/clients/${id}/evaluate-scopes/generate-example-id-token?${query}`,
        undefined,
        PACKAGE_REALM
      )) as Record<string, unknown>;
    };

    // A web client gets profile: this person does have a user name and a
    // locale, so their absence below is the partner's scopes at work.
    expect(await idToken("tedris-local", "openid")).toMatchObject({
      preferred_username: "ornek-kisi",
      locale: "ar",
    });

    const partner = await idToken(PARTNER_ID, "openid");
    expect(partner).toMatchObject({
      given_name: "Ayşe",
      family_name: "Yılmaz",
      name: "Ayşe Yılmaz",
      email: "ornek-kisi@example.test",
      email_verified: true,
      gender: "FEMALE",
    });
    // The evaluation ignores a scope the client does not have, so naming the
    // removed ones adds nothing; the sign-in refuses them (next test).
    const asking = await idToken(
      PARTNER_ID,
      "openid profile microprofile-jwt roles"
    );
    for (const token of [partner, asking]) {
      for (const claim of ["preferred_username", "upn", "locale"]) {
        expect(token).not.toHaveProperty(claim);
      }
    }
  });

  it("refuses the partner's sign-in when it asks for profile, and starts it for its own scopes", async () => {
    /** The authorization request the partner's "Medaris ile giriş yap" sends. */
    const signIn = (scope: string) =>
      fetch(
        `${kcUrl}/realms/${PACKAGE_REALM}/protocol/openid-connect/auth?${new URLSearchParams(
          {
            client_id: PARTNER_ID,
            response_type: "code",
            scope,
            redirect_uri: "https://ornek.example/auth/medaris/callback",
            state: "partner",
            code_challenge: createHash("sha256")
              .update(randomBytes(32).toString("base64url"))
              .digest("base64url"),
            code_challenge_method: "S256",
          }
        )}`,
        { redirect: "manual" }
      );

    for (const scope of ["openid profile", "openid microprofile-jwt"]) {
      const refused = await signIn(scope);
      const location = new URL(refused.headers.get("location") ?? "", kcUrl);
      expect(location.searchParams.get("error"), scope).toBe("invalid_scope");
    }
    const started = await signIn("openid email full-name gender");
    expect(started.status).toBe(200);
    expect(await started.text()).toContain("kc-form-login");
  });

  it("takes profile off the partner again when it is put back by hand", async () => {
    const { id } = await clientOf(PARTNER_ID, PACKAGE_REALM);
    const scopes = (await adminApi(
      "GET",
      "/client-scopes",
      undefined,
      PACKAGE_REALM
    )) as { id: string; name: string }[];
    const profile = scopes.find((scope) => scope.name === "profile");
    await adminApi(
      "PUT",
      `/clients/${id}/default-client-scopes/${profile?.id}`,
      undefined,
      PACKAGE_REALM
    );
    expect((await partnerScopes()).default).toContain("profile");

    const drift = packageScript("verify");
    expect(drift.status).toBe(1);
    expect(drift.stdout).toContain(
      "client.defaultClientScopes[profile]: repository removes it, server present"
    );
    const applied = packageScript("provision");
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.stdout).toContain(`client ${PARTNER_ID}: updated`);
    expect((await partnerScopes()).default).not.toContain("profile");
    const clean = packageScript("verify");
    expect(clean.status, clean.stdout).toBe(0);
  });
});
