import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  GenericContainer,
  Network,
  StartedNetwork,
  StartedTestContainer,
  Wait,
} from "testcontainers";
import {
  createTestApp,
  useDatabaseForThisFile,
} from "../helpers/test-app.helper";

/**
 * MDRS-97. The Keycloak configuration package in `config/keycloak/`,
 * provisioned into a blank Keycloak 26 container:
 *
 *   - `validate` passes on the repository and fails on a literal secret;
 *   - `provision local` builds the `medaris` realm with the settings the
 *     issue pins, a second run changes nothing and `verify` reports no
 *     difference;
 *   - a setting changed in the JSON is applied by the next run (and `dry-run`
 *     shows it without writing);
 *   - the registration form refuses anyone who has not ticked the privacy
 *     notice box — Keycloak itself, from the user profile (MDRS-102);
 *   - a new user registers through the registration form, receives the
 *     verification e-mail in Mailpit, follows it, and the resulting token is
 *     accepted by tedrisat — the real AuthGuard and `KeycloakPublicKeyProvider`
 *     checking `iss`, `aud` and `azp`.
 *
 * The production realm itself is provisioned by the Keycloak admin; see
 * config/keycloak/RUNBOOK.md and docs/migration/mdrs-97-keycloak-config-package.md.
 */

// Must track `run-keycloak` in apps/keycloak-theme/package.json, as in
// keycloak-audience.e2e.spec.ts.
const KEYCLOAK_IMAGE =
  process.env.KEYCLOAK_IMAGE ?? "quay.io/keycloak/keycloak:26.3.2";
// Same pin as keycloak-smtp.e2e.spec.ts.
const MAILPIT_IMAGE = "axllent/mailpit:v1.27";
const CONFIG_DIR = join(__dirname, "../../../../config/keycloak");
const SCRIPTS = join(CONFIG_DIR, "scripts");
const REALM = "medaris";
const ENV = "local";
const API_CLIENT_ID = "tedrisat-api";
const WEB_CLIENT_ID = "tedris-local";
const WEB_ORIGIN = "http://localhost:4000";
const REDIRECT_URI = `${WEB_ORIGIN}/api/auth/callback/keycloak`;
const SENDER = "no-reply@medaris.test";
const SMTP_USER = "medaris-mailer";
// Per run, so a leak into output or argv could not match by accident.
const run = Math.random().toString(36).slice(2);
const ADMIN_PASSWORD = `mdrs-97-admin-${run}`;
const SMTP_PASSWORD = `mdrs-97-smtp-${run}`;
const CLIENT_SECRET = `mdrs-97-client-${run}`;

type Script = "provision" | "validate" | "dry-run" | "verify";

describe("Keycloak configuration package (e2e)", () => {
  let network: StartedNetwork;
  let keycloak: StartedTestContainer;
  let mailpit: StartedTestContainer;
  let kcUrl: string;
  let mailUrl: string;
  let app: INestApplication;
  let firstRun: string;

  /**
   * One of the package's scripts, with a clean environment: whatever the
   * developer's shell exports for them (KC_*, ALLOW_*) is dropped, so it
   * cannot change what the realm is asserted against.
   */
  const spawnScript = (
    script: Script,
    env: NodeJS.ProcessEnv = {},
    args: string[] = [ENV]
  ) => {
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !/^(KC_|ALLOW_)/.test(key))
    );
    const merged: NodeJS.ProcessEnv = {
      ...inherited,
      KC_URL: kcUrl,
      KC_ADMIN_USER: "admin",
      KC_ADMIN_PASSWORD: ADMIN_PASSWORD,
      KC_SMTP_HOST: "mailpit",
      KC_SMTP_PORT: "1025",
      // Mailpit speaks plain SMTP, which the scripts only allow with
      // credentials behind this explicit opt-in (MDRS-98).
      KC_SMTP_SECURITY: "none",
      ALLOW_INSECURE_SMTP: "1",
      KC_SMTP_FROM: SENDER,
      KC_SMTP_FROM_DISPLAY_NAME: "Medaris",
      KC_SMTP_USER: SMTP_USER,
      KC_SMTP_PASSWORD: SMTP_PASSWORD,
      ...env,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined) delete merged[key];
    }
    return spawnSync("bash", [join(SCRIPTS, script), ...args], {
      env: merged,
      encoding: "utf8",
    });
  };

  const runScript = (script: Script, env: NodeJS.ProcessEnv = {}) => {
    const result = spawnScript(script, env);
    if (result.status !== 0) {
      throw new Error(
        `${script} exited ${result.status}: ${result.stdout}${result.stderr}`
      );
    }
    return result.stdout;
  };

  /** A copy of the package to edit; the scripts read it via KC_CONFIG_DIR. */
  const editedCopy = (edit: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "mdrs-97-config-"));
    cpSync(CONFIG_DIR, dir, { recursive: true });
    edit(dir);
    return dir;
  };

  const editJson = (
    file: string,
    change: (json: Record<string, unknown>) => void
  ) => {
    const json = JSON.parse(readFileSync(file, "utf8"));
    change(json);
    writeFileSync(file, JSON.stringify(json, null, 2));
  };

  let token: { value: string; until: number } | undefined;

  /** One admin token, renewed shortly before its 60-second lifetime ends. */
  const adminToken = async () => {
    if (token !== undefined && Date.now() < token.until) {
      return token.value;
    }
    const response = await fetch(
      `${kcUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "password",
          client_id: "admin-cli",
          username: "admin",
          password: ADMIN_PASSWORD,
        }),
      }
    );
    const value = ((await response.json()) as { access_token: string })
      .access_token;
    token = { value, until: Date.now() + 45_000 };
    return value;
  };

  const adminApi = async (method: string, path: string) => {
    const response = await fetch(`${kcUrl}/admin/realms/${REALM}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await adminToken()}` },
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

  /** Waits for the first message to `address`, then reads it whole. */
  const mailTo = async (address: string, withinMs = 60_000) => {
    const since = Date.now();
    while (Date.now() - since < withinMs) {
      const search = await fetch(
        `${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`
      );
      const { messages } = (await search.json()) as {
        messages: { ID: string }[];
      };
      if (messages.length > 0) {
        const message = await fetch(
          `${mailUrl}/api/v1/message/${messages[0]?.ID}`
        );
        return (await message.json()) as {
          From: { Address: string };
          Subject: string;
          Text: string;
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`no e-mail to ${address} within ${withinMs} ms`);
  };

  const decodeAmp = (value: string) => value.replace(/&amp;/g, "&");
  const formAction = (html: string) => {
    const action = html.match(/action="([^"]+)"/)?.[1];
    if (!action) throw new Error("no form on the page");
    return decodeAmp(action);
  };

  /**
   * A cookie-carrying browser. Follows redirects by hand and stops at the
   * web client's callback, which nothing listens on here: that redirect's
   * `code` is what NextAuth would exchange.
   */
  const browser = () => {
    const jar = new Map<string, string>();
    const remember = (response: Response) => {
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const eq = pair.indexOf("=");
        jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    };
    const cookieHeader = () =>
      [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const open = async (url: string, form?: Record<string, string>) => {
      let current = url;
      let response = await fetch(current, {
        method: form ? "POST" : "GET",
        redirect: "manual",
        headers: {
          Cookie: cookieHeader(),
          ...(form
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        body: form ? new URLSearchParams(form) : undefined,
      });
      remember(response);
      for (let hop = 0; hop < 10; hop++) {
        const location = response.headers.get("location");
        if (response.status < 300 || response.status >= 400 || !location) {
          break;
        }
        const next = new URL(location, current).toString();
        if (next.startsWith(REDIRECT_URI)) {
          return { status: response.status, html: "", callback: next };
        }
        current = next;
        response = await fetch(current, {
          redirect: "manual",
          headers: { Cookie: cookieHeader() },
        });
        remember(response);
      }
      return {
        status: response.status,
        html: await response.text(),
        callback: undefined as string | undefined,
      };
    };
    return { open };
  };

  const claims = (jwt: string) =>
    JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

  beforeAll(async () => {
    network = await new Network().start();
    mailpit = await new GenericContainer(MAILPIT_IMAGE)
      .withNetwork(network)
      .withNetworkAliases("mailpit")
      .withEnvironment({
        // Only this login is accepted, so a delivered message proves the
        // password travelled from the environment into the realm.
        MP_SMTP_AUTH: `${SMTP_USER}:${SMTP_PASSWORD}`,
        MP_SMTP_AUTH_ALLOW_INSECURE: "true",
      })
      .withExposedPorts(8025)
      .withWaitStrategy(Wait.forHttp("/livez", 8025))
      .start();
    mailUrl = `http://localhost:${mailpit.getMappedPort(8025)}`;

    keycloak = await new GenericContainer(KEYCLOAK_IMAGE)
      .withNetwork(network)
      .withEnvironment({
        KC_BOOTSTRAP_ADMIN_USERNAME: "admin",
        KC_BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD,
      })
      .withCommand(["start-dev"])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/realms/master", 8080))
      .withStartupTimeout(180_000)
      .start();
    // `localhost`, not the container host's IP: the issuer Keycloak stamps is
    // the host the request used, and every request below has to agree on it.
    kcUrl = `http://localhost:${keycloak.getMappedPort(8080)}`;

    firstRun = runScript("provision");

    // As in keycloak-audience.e2e.spec.ts: make this file's database, then
    // point the API at the container's realm before AppModule reads it.
    await useDatabaseForThisFile();
    process.env.KEYCLOAK_JWKS_URL = `${kcUrl}/realms/${REALM}/protocol/openid-connect/certs`;
    process.env.KEYCLOAK_ISSUER = `${kcUrl}/realms/${REALM}`;
    process.env.KEYCLOAK_AUDIENCE = API_CLIENT_ID;
    process.env.KEYCLOAK_ALLOWED_CLIENTS = [
      "tedris-local",
      "nizam-local",
      "nazir-local",
    ].join(",");
    app = await createTestApp({ keyProvider: "real" });
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await keycloak?.stop();
    await mailpit?.stop();
    await network?.stop();
  });

  it("validate passes on the repository", () => {
    const result = spawnScript("validate", {}, []);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate: ok");
  });

  it("validate fails when the privacy notice box is no longer required (MDRS-102)", () => {
    const dir = editedCopy((copy) =>
      editJson(join(copy, "user-profile.json"), (profile) => {
        const attributes = profile.attributes as {
          name: string;
          required?: unknown;
        }[];
        const box = attributes.find((a) => a.name === "privacyNoticeRead");
        if (box) delete box.required;
      })
    );
    try {
      const result = spawnScript("validate", { KC_CONFIG_DIR: dir }, []);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "user-profile.json: privacyNoticeRead must be required for users"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validate fails on a JSON file with a literal secret in it", () => {
    const dir = editedCopy((copy) =>
      editJson(join(copy, "clients/prod/tedris.json"), (client) => {
        client.secret = "pasted-from-the-admin-console";
      })
    );
    try {
      const result = spawnScript("validate", { KC_CONFIG_DIR: dir }, []);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "clients/prod/tedris.json: literal secret at .secret"
      );
      // provision runs validate first and stops before touching the server.
      const provision = spawnScript("provision", {
        KC_CONFIG_DIR: dir,
      });
      expect(provision.status).toBe(1);
      expect(provision.stdout).not.toContain("realm medaris");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds the realm on a blank Keycloak with the settings the issue pins", async () => {
    expect(firstRun).toContain("realm medaris: created");
    expect(firstRun).toContain(`client ${WEB_CLIENT_ID}: created`);
    expect(firstRun).toContain(`client ${API_CLIENT_ID}: created`);

    const realm = await adminApi("GET", "");
    expect(realm).toMatchObject({
      realm: REALM,
      displayName: "Medaris",
      registrationAllowed: true,
      verifyEmail: true,
      loginWithEmailAllowed: true,
      duplicateEmailsAllowed: false,
      resetPasswordAllowed: true,
      bruteForceProtected: true,
      sslRequired: "external",
      internationalizationEnabled: true,
      defaultLocale: "tr",
      loginTheme: "medaris-keycloak-theme",
      emailTheme: "medaris-keycloak-theme",
      accessTokenLifespan: 300,
      rememberMe: true,
      ssoSessionIdleTimeout: 18000,
      ssoSessionMaxLifespan: 36000,
      ssoSessionIdleTimeoutRememberMe: 1209600,
      ssoSessionMaxLifespanRememberMe: 2592000,
    });
    // The owner's link lifetimes (MDRS-97, 3 October): verification 24 h,
    // password reset 30 min.
    expect(realm.attributes).toMatchObject({
      "actionTokenGeneratedByUserLifespan.verify-email": "86400",
      "actionTokenGeneratedByUserLifespan.reset-credentials": "1800",
    });
    expect([...realm.supportedLocales].sort()).toEqual(["ar", "en", "tr"]);
    expect(realm.passwordPolicy).toContain("length(10)");
    expect(realm.passwordPolicy).toContain("notEmail");
    expect(realm.passwordPolicy).toContain("notUsername");
    expect(realm.smtpServer).toMatchObject({ host: "mailpit", from: SENDER });

    // tedrisat checks for exactly this string (ROLES.SYSTEM_ADMIN).
    expect((await adminApi("GET", "/roles/SYSTEM_ADMIN")).name).toBe(
      "SYSTEM_ADMIN"
    );

    const profile = await adminApi("GET", "/users/profile");
    expect(
      profile.attributes.map((attribute: { name: string }) => attribute.name)
    ).toEqual([
      "username",
      "email",
      "firstName",
      "lastName",
      "privacyNoticeRead",
    ]);
    for (const name of [
      "email",
      "firstName",
      "lastName",
      "privacyNoticeRead",
    ]) {
      expect(
        profile.attributes.find((a: { name: string }) => a.name === name)
          .required.roles
      ).toContain("user");
    }

    const [web] = await adminApi("GET", `/clients?clientId=${WEB_CLIENT_ID}`);
    expect(web).toMatchObject({
      publicClient: false,
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      redirectUris: [REDIRECT_URI],
      webOrigins: [WEB_ORIGIN],
    });
    expect(web.attributes["pkce.code.challenge.method"]).toBe("S256");
    const [api] = await adminApi("GET", `/clients?clientId=${API_CLIENT_ID}`);
    expect(api).toMatchObject({
      standardFlowEnabled: false,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
    });
  });

  it("changes nothing on a second run, and verify reports no difference", () => {
    const secondRun = runScript("provision");

    expect(secondRun).not.toMatch(/: (created|updated)/);
    expect(secondRun).toContain("provision: done (0 difference(s) applied)");
    expect(runScript("verify")).toContain("verify: no difference");
  });

  it("applies a setting changed in the JSON on the next run", async () => {
    const dir = editedCopy((copy) => {
      editJson(join(copy, "realms/_base.json"), (realm) => {
        realm.accessTokenLifespan = 600;
      });
      editJson(join(copy, "clients/local/tedris.json"), (client) => {
        (client.redirectUris as string[]).push(`${WEB_ORIGIN}/second-callback`);
      });
    });
    try {
      // dry-run names the change and writes nothing.
      const plan = runScript("dry-run", { KC_CONFIG_DIR: dir });
      expect(plan).toContain("realm medaris: would update");
      expect(plan).toContain("realm.accessTokenLifespan: repository 600");
      expect((await adminApi("GET", "")).accessTokenLifespan).toBe(300);

      const applied = runScript("provision", { KC_CONFIG_DIR: dir });
      expect(applied).toContain("realm medaris: updated");
      expect(applied).toContain(`client ${WEB_CLIENT_ID}: updated`);
      expect((await adminApi("GET", "")).accessTokenLifespan).toBe(600);
      const [web] = await adminApi("GET", `/clients?clientId=${WEB_CLIENT_ID}`);
      expect(web.redirectUris).toContain(`${WEB_ORIGIN}/second-callback`);

      // Against the unchanged repository, verify now fails and says why.
      const drift = spawnScript("verify");
      expect(drift.status).toBe(1);
      expect(drift.stdout).toContain(
        "realm.accessTokenLifespan: repository 300, server 600"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
      spawnScript("provision");
    }
    expect(runScript("verify")).toContain("verify: no difference");
  });

  it("sets a client secret from the environment without printing it or putting it on a command line", async () => {
    // `curl` and `jq` are replaced on PATH by wrappers that log their argv,
    // so every command line the script builds is recorded.
    const shims = mkdtempSync(join(tmpdir(), "mdrs-97-argv-"));
    const argvLog = join(shims, "argv.log");
    try {
      for (const tool of ["curl", "jq"]) {
        const real = spawnSync("bash", ["-c", `command -v ${tool}`], {
          encoding: "utf8",
        }).stdout.trim();
        const shim = join(shims, tool);
        writeFileSync(
          shim,
          `#!/usr/bin/env bash\nprintf '%s\\n' "${tool} $*" >> "${argvLog}"\nexec "${real}" "$@"\n`
        );
        chmodSync(shim, 0o755);
      }
      const result = spawnScript("provision", {
        KC_CLIENT_SECRET_TEDRIS_LOCAL: CLIENT_SECRET,
        PATH: `${shims}:${process.env.PATH}`,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`client ${WEB_CLIENT_ID}: updated`);
      expect(result.stdout).toContain("client.secret: differs (value hidden)");
      const argv = readFileSync(argvLog, "utf8");
      expect(argv).toContain(`/admin/realms/${REALM}`);
      for (const secret of [CLIENT_SECRET, SMTP_PASSWORD, ADMIN_PASSWORD]) {
        expect(argv).not.toContain(secret);
        expect(result.stdout).not.toContain(secret);
        expect(result.stderr).not.toContain(secret);
      }
    } finally {
      rmSync(shims, { recursive: true, force: true });
    }
    expect(await clientSecret(WEB_CLIENT_ID)).toBe(CLIENT_SECRET);
    // With the same secret the realm is in sync; without the variable the
    // secret is not compared and left as it is.
    expect(
      runScript("verify", { KC_CLIENT_SECRET_TEDRIS_LOCAL: CLIENT_SECRET })
    ).toContain("verify: no difference");
    expect(runScript("verify")).toContain("verify: no difference");
  });

  /**
   * The registration form, reached the way tedris-web's "Kayıt ol" does
   * (MDRS-101): the authorization endpoint with PKCE, on the register page.
   * Returns the PKCE verifier the code exchange needs.
   */
  const registrationForm = async (page: ReturnType<typeof browser>) => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const form = await page.open(
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/registrations?${new URLSearchParams(
        {
          client_id: WEB_CLIENT_ID,
          response_type: "code",
          scope: "openid",
          redirect_uri: REDIRECT_URI,
          state: "mdrs-97",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }
      )}`
    );
    expect(form.html).toContain("kc-register-form");
    return { ...form, verifier };
  };

  it.each([
    ["without the privacy notice box", undefined],
    ["with any other value in it", "no"],
  ])("refuses a registration %s (MDRS-102)", async (_, box) => {
    const page = browser();
    const form = await registrationForm(page);
    const email = `no-notice-${box ?? "unticked"}-${run}@medaris.test`;
    const password = `Kayit-${run}-Parola`;
    const fields = {
      firstName: "Yeni",
      lastName: "Kullanıcı",
      email,
      username: `no-notice-${box ?? "unticked"}-${run}`,
      password,
      "password-confirm": password,
    };

    // Posted straight to Keycloak: no theme, no browser-side check involved.
    const refused = await page.open(formAction(form.html), {
      ...fields,
      ...(box === undefined ? {} : { privacyNoticeRead: box }),
    });

    expect(refused.callback).toBeUndefined();
    expect(refused.status).toBe(200);
    // The form again, not the "verify your e-mail" page.
    expect(refused.html).toContain("kc-register-form");
    expect(
      await adminApi(
        "GET",
        `/users?exact=true&email=${encodeURIComponent(email)}`
      )
    ).toEqual([]);

    // The box was the only thing wrong: the same fields, ticked, register.
    const accepted = await page.open(formAction(refused.html), {
      ...fields,
      privacyNoticeRead: "yes",
    });
    expect(accepted.html).not.toContain("kc-register-form");
    const [created] = await adminApi(
      "GET",
      `/users?exact=true&email=${encodeURIComponent(email)}`
    );
    expect(created.attributes?.privacyNoticeRead).toEqual(["yes"]);
  });

  it("lets a new user register, verify the e-mail through Mailpit, and obtain a token tedrisat accepts", async () => {
    const email = `new-user-${run}@medaris.test`;
    const password = `Kayit-${run}-Parola`;
    const page = browser();
    const form = await registrationForm(page);
    const { verifier } = form;

    const registered = await page.open(formAction(form.html), {
      firstName: "Yeni",
      lastName: "Kullanıcı",
      email,
      username: `new-user-${run}`,
      password,
      "password-confirm": password,
      // MDRS-102: the "Aydınlatma Metni'ni okudum" box, ticked.
      privacyNoticeRead: "yes",
    });
    // E-mail verification is on: no code yet, the "verify your e-mail" page.
    expect(registered.callback).toBeUndefined();
    const [pending] = await adminApi(
      "GET",
      `/users?exact=true&email=${encodeURIComponent(email)}`
    );
    expect(pending.emailVerified).toBe(false);
    expect(pending.attributes?.privacyNoticeRead).toEqual(["yes"]);

    const mail = await mailTo(email);
    expect(mail.From.Address).toBe(SENDER);
    const link = mail.Text.match(
      /https?:\/\/\S+\/login-actions\/action-token\?\S+/
    )?.[0];
    expect(link, "verification link").toBeDefined();

    // Followed in the same browser, the link verifies the address and
    // finishes the login: Keycloak redirects to the web client with a code.
    let followed = await page.open(link as string);
    if (followed.callback === undefined) {
      // Some Keycloak versions ask to confirm before continuing.
      const next = followed.html.match(
        /href="(https?:\/\/[^"]+\/login-actions\/[^"]+)"/
      )?.[1];
      expect(next, "continue link").toBeDefined();
      followed = await page.open(decodeAmp(next as string));
    }
    expect(followed.callback, "redirect to the web client").toBeDefined();
    const code = new URL(followed.callback as string).searchParams.get("code");
    expect(code).toBeTruthy();

    const [verified] = await adminApi(
      "GET",
      `/users?exact=true&email=${encodeURIComponent(email)}`
    );
    expect(verified.emailVerified).toBe(true);

    // The exchange NextAuth performs: code + PKCE verifier + client secret.
    const tokens = await fetch(
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: WEB_CLIENT_ID,
          client_secret: await clientSecret(WEB_CLIENT_ID),
          code: code as string,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI,
        }),
      }
    );
    expect(tokens.status).toBe(200);
    const accessToken = ((await tokens.json()) as { access_token: string })
      .access_token;

    expect(claims(accessToken)).toMatchObject({
      iss: `${kcUrl}/realms/${REALM}`,
      aud: expect.arrayContaining([API_CLIENT_ID]),
      azp: WEB_CLIENT_ID,
      email,
      email_verified: true,
    });

    const response = await request(app.getHttpServer())
      .get("/flashcard/decks/collections")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
  }, 120_000);
});
