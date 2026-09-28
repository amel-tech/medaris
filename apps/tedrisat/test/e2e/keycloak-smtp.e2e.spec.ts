import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GenericContainer,
  Network,
  StartedNetwork,
  StartedTestContainer,
  Wait,
} from "testcontainers";

/**
 * MDRS-98. The repository half of "give the realm a working mail sender":
 * `tools/keycloak/setup-realm.sh` writes the realm's SMTP settings from
 * KC_SMTP_* environment variables, and the realm then delivers the
 * verification and the password-reset e-mail through them.
 *
 * The SMTP server is a Mailpit container that only accepts mail after an
 * AUTH with one user and password, so a delivered message proves that the
 * password travelled from the environment into the realm. The provider, the
 * sender domain's SPF/DKIM/DMARC records and real inboxes are outside the
 * repository; see docs/migration/mdrs-98-realm-mail-sender.md.
 */

// Must track `run-keycloak` in apps/keycloak-theme/package.json, as in
// keycloak-audience.e2e.spec.ts.
const KEYCLOAK_IMAGE =
  process.env.KEYCLOAK_IMAGE ?? "quay.io/keycloak/keycloak:26.3.2";
// Same pin as apps/keycloak-theme/test/email.e2e.spec.ts.
const MAILPIT_IMAGE = "axllent/mailpit:v1.27";
const REALM = "amel-tech-dev";
const SENDER = "no-reply@medaris.test";
const SENDER_NAME = "Medaris";
const SMTP_USER = "medaris-mailer";
// Per run, so a leak into the script's output could not match by accident.
const SMTP_PASSWORD = `mdrs-98-${Math.random().toString(36).slice(2)}`;
const SETUP_SCRIPT = join(
  __dirname,
  "../../../../tools/keycloak/setup-realm.sh"
);

type Mail = {
  From: { Name: string; Address: string };
  Subject: string;
  Text: string;
};

describe("Keycloak realm mail sender (e2e)", () => {
  let network: StartedNetwork;
  let keycloak: StartedTestContainer;
  let mailpit: StartedTestContainer;
  let kcUrl: string;
  let mailUrl: string;
  let firstRun: string;

  const smtpEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KC_SMTP_HOST: "mailpit",
    KC_SMTP_PORT: "1025",
    // Mailpit here speaks plain SMTP, which the script only allows with
    // credentials behind this explicit opt-in.
    KC_SMTP_SECURITY: "none",
    ALLOW_INSECURE_SMTP: "1",
    KC_SMTP_FROM: SENDER,
    KC_SMTP_FROM_DISPLAY_NAME: SENDER_NAME,
    KC_SMTP_USER: SMTP_USER,
    KC_SMTP_PASSWORD: SMTP_PASSWORD,
    ...overrides,
  });

  /**
   * The script with a clean environment: whatever the developer's shell
   * exports for the script (KC_SMTP_*, REALM, KC_ADMIN_*, …) is dropped, so
   * it cannot change what the realm is asserted against.
   */
  const spawnSetup = (env: NodeJS.ProcessEnv = {}) => {
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^(KC_|REALM$|API_CLIENT_ID$|WEB_CLIENTS$|ALLOW_)/.test(key)
      )
    );
    const merged: NodeJS.ProcessEnv = {
      ...inherited,
      KC_URL: kcUrl,
      WEB_CLIENTS: "tedris-dev=http://localhost:4000",
      ...env,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined) delete merged[key];
    }
    return spawnSync("bash", [SETUP_SCRIPT], {
      env: merged,
      encoding: "utf8",
    });
  };

  const runSetup = (env: NodeJS.ProcessEnv = {}) => {
    const result = spawnSetup(env);
    if (result.status !== 0) {
      throw new Error(`setup-realm.sh failed: ${result.stderr}`);
    }
    return result.stdout;
  };

  /** stderr of a run that is expected to fail. */
  const failedSetup = (env: NodeJS.ProcessEnv) => {
    const result = spawnSetup(env);
    if (result.status === 0) {
      throw new Error("setup-realm.sh was expected to fail");
    }
    return result.stderr;
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
          password: "admin",
        }),
      }
    );
    const value = ((await response.json()) as { access_token: string })
      .access_token;
    token = { value, until: Date.now() + 45_000 };
    return value;
  };

  const adminCall = async (method: string, path: string, body?: unknown) =>
    fetch(`${kcUrl}/admin/realms/${REALM}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await adminToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  const adminApi = async (method: string, path: string, body?: unknown) => {
    const response = await adminCall(method, path, body);
    if (!response.ok) {
      throw new Error(`${method} ${path} → ${response.status}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };

  const createUser = async (username: string) => {
    await adminApi("POST", "/users", {
      username,
      email: `${username}@medaris.test`,
      firstName: "Test",
      lastName: "User",
      enabled: true,
      emailVerified: false,
    });
    const [user] = await adminApi(
      "GET",
      `/users?exact=true&username=${username}`
    );
    return user as { id: string; emailVerified: boolean };
  };

  /**
   * Waits for the one message sent to `address`, then reads it whole. Gives
   * up `withinMs` after `since` — AC 1's "within one minute" is this bound.
   */
  const mailTo = async (
    address: string,
    since = Date.now(),
    withinMs = 30_000
  ): Promise<Mail> => {
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
        return (await message.json()) as Mail;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`no e-mail to ${address} within ${withinMs} ms`);
  };

  const actionLink = (mail: Mail) => {
    const link = mail.Text.match(
      /https?:\/\/\S+\/login-actions\/action-token\?\S+/
    )?.[0];
    if (!link) throw new Error(`no action link in "${mail.Subject}"`);
    return link;
  };

  /**
   * A cookie-carrying browser for one link: `fetch` keeps no jar, and
   * Keycloak ties the pages after an action link to its auth-session cookie.
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
    /** Follows redirects by hand, carrying the jar; returns the last page. */
    const open = async (url: string, form?: Record<string, string>) => {
      let response = await fetch(url, {
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
        response = await fetch(new URL(location, url), {
          redirect: "manual",
          headers: { Cookie: cookieHeader() },
        });
        remember(response);
      }
      return { status: response.status, html: await response.text() };
    };
    return { open };
  };

  const decodeAmp = (value: string) => value.replace(/&amp;/g, "&");
  const formAction = (html: string) => {
    const action = html.match(/action="([^"]+)"/)?.[1];
    if (!action) throw new Error("no form on the page");
    return decodeAmp(action);
  };

  beforeAll(async () => {
    network = await new Network().start();
    mailpit = await new GenericContainer(MAILPIT_IMAGE)
      .withNetwork(network)
      .withNetworkAliases("mailpit")
      .withEnvironment({
        // Only this login is accepted; any other is refused at AUTH.
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
        KC_BOOTSTRAP_ADMIN_PASSWORD: "admin",
      })
      .withCommand(["start-dev"])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/realms/master", 8080))
      .withStartupTimeout(180_000)
      .start();
    kcUrl = `http://localhost:${keycloak.getMappedPort(8080)}`;

    firstRun = runSetup(smtpEnv());
    // The "forgot password" link on the login page is MDRS-97's realm
    // setting, not this issue's; the reset e-mail needs it on.
    await adminApi("PUT", "", { resetPasswordAllowed: true });
  }, 300_000);

  afterAll(async () => {
    await keycloak?.stop();
    await mailpit?.stop();
    await network?.stop();
  });

  it("writes the sender from the environment into the realm", async () => {
    expect(firstRun).toContain(
      `mail sender\n      configured (${SENDER} via mailpit:1025, none, as ${SMTP_USER})`
    );

    const realm = await adminApi("GET", "");
    expect(realm.smtpServer).toMatchObject({
      host: "mailpit",
      port: "1025",
      from: SENDER,
      fromDisplayName: SENDER_NAME,
      auth: "true",
      user: SMTP_USER,
      starttls: "false",
      ssl: "false",
    });
    // Keycloak holds the password and only ever returns a mask of it.
    expect(realm.smtpServer.password).toBe("**********");
  });

  it("never prints the SMTP password or puts it on a command line", () => {
    // `curl` and `jq` are replaced on PATH by wrappers that log their argv
    // and then run the real tool, so every command line the script builds is
    // recorded — a command line is readable by every user of the machine.
    const shims = mkdtempSync(join(tmpdir(), "mdrs-98-argv-"));
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
      const result = spawnSetup({
        ...smtpEnv(),
        PATH: `${shims}:${process.env.PATH}`,
      });

      expect(result.status).toBe(0);
      const argv = readFileSync(argvLog, "utf8");
      // The wrappers really ran, including the call that sends the sender.
      expect(argv).toContain(`/admin/realms/${REALM}`);
      expect(argv).not.toContain(SMTP_PASSWORD);
      expect(result.stdout).not.toContain(SMTP_PASSWORD);
      expect(result.stderr).not.toContain(SMTP_PASSWORD);
    } finally {
      rmSync(shims, { recursive: true, force: true });
    }
  });

  it("delivers the verification e-mail from the sender, and its link verifies the address", async () => {
    const user = await createUser("verify-user");
    const sent = Date.now();

    await adminApi("PUT", `/users/${user.id}/send-verify-email`);
    const mail = await mailTo("verify-user@medaris.test", sent, 60_000);

    expect(mail.From).toEqual({ Name: SENDER_NAME, Address: SENDER });

    // Opened in a browser with no session, Keycloak first asks to confirm
    // the address; the confirm link is what a person clicks next.
    const page = browser();
    const first = await page.open(actionLink(mail));
    expect(first.status).toBe(200);
    const confirm = first.html.match(
      /href="(https?:\/\/[^"]+\/login-actions\/action-token\?[^"]+)"/
    )?.[1];
    expect(confirm, "confirm link").toBeDefined();
    await page.open(decodeAmp(confirm as string));

    const [after] = await adminApi(
      "GET",
      "/users?exact=true&username=verify-user"
    );
    expect(after.emailVerified).toBe(true);
  }, 90_000);

  it("delivers the password-reset e-mail, and its link sets a password that logs in", async () => {
    await createUser("reset-user");

    // The "forgot password" form, as a browser submits it.
    const requester = browser();
    const form = await requester.open(
      `${kcUrl}/realms/${REALM}/login-actions/reset-credentials?client_id=account-console`
    );
    await requester.open(formAction(form.html), { username: "reset-user" });

    const mail = await mailTo("reset-user@medaris.test");
    expect(mail.From).toEqual({ Name: SENDER_NAME, Address: SENDER });

    // The link, opened somewhere else — the phone the e-mail was read on.
    const reader = browser();
    const update = await reader.open(actionLink(mail));
    expect(update.html).toContain('name="password-new"');
    const newPassword = "Mdrs-98-new-password";
    await reader.open(formAction(update.html), {
      "password-new": newPassword,
      "password-confirm": newPassword,
    });

    // Every realm has `admin-cli` with the password grant; it is only the
    // shortest way to prove the new password is the one that now works.
    const login = await fetch(
      `${kcUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "password",
          client_id: "admin-cli",
          username: "reset-user",
          password: newPassword,
        }),
      }
    );
    expect(login.status).toBe(200);
  });

  it("sends nothing with a wrong password, so the realm really uses the one from the environment", async () => {
    runSetup(smtpEnv({ KC_SMTP_PASSWORD: "not-the-password" }));
    let sent: boolean;
    let restored: string;
    try {
      const user = await createUser("wrong-password-user");
      const response = await adminCall(
        "PUT",
        `/users/${user.id}/send-verify-email`
      );
      sent = response.ok;
    } finally {
      // A re-run with the right password is how a rotation is applied. Its
      // result is checked after, so a failure here cannot mask the one above.
      restored = spawnSetup(smtpEnv()).stdout;
    }

    expect(sent).toBe(false);
    expect(restored).toContain("configured");
  });

  it("leaves the realm's sender alone when KC_SMTP_HOST is not set", async () => {
    const run = runSetup({ KC_SMTP_HOST: undefined });

    expect(run).toContain(
      "mail sender\n      skipped (set KC_SMTP_HOST to configure it)"
    );
    expect((await adminApi("GET", "")).smtpServer.host).toBe("mailpit");
  });

  it("refuses a half-set sender before changing anything", () => {
    expect(failedSetup(smtpEnv({ KC_SMTP_FROM: undefined }))).toContain(
      "KC_SMTP_FROM is not"
    );
    expect(failedSetup(smtpEnv({ KC_SMTP_PASSWORD: undefined }))).toContain(
      "set KC_SMTP_USER and KC_SMTP_PASSWORD together"
    );
    expect(failedSetup(smtpEnv({ KC_SMTP_SECURITY: "tls" }))).toContain(
      "KC_SMTP_SECURITY must be starttls, ssl or none"
    );
    expect(failedSetup(smtpEnv({ KC_SMTP_PORT: "25x" }))).toContain(
      "KC_SMTP_PORT must be a number"
    );
  });

  it("refuses to send the SMTP password in cleartext without the opt-in, even from localhost", () => {
    // The password crosses the Keycloak -> SMTP hop, which a localhost KC_URL
    // (a port-forward to a production realm, say) says nothing about.
    expect(failedSetup(smtpEnv({ ALLOW_INSECURE_SMTP: undefined }))).toContain(
      "would send the SMTP password in cleartext"
    );
  });

  it("uses the implicit-TLS port by default with ssl", async () => {
    const run = runSetup(
      smtpEnv({ KC_SMTP_SECURITY: "ssl", KC_SMTP_PORT: undefined })
    );
    try {
      expect(run).toContain("via mailpit:465, ssl");
      expect((await adminApi("GET", "")).smtpServer).toMatchObject({
        port: "465",
        ssl: "true",
        starttls: "false",
      });
    } finally {
      // Not asserted here, so it cannot replace a failure above.
      spawnSetup(smtpEnv());
    }
  });
});
