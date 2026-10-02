/**
 * MDRS-100 AC 3 against a real Keycloak: a user's verification e-mail — and
 * the password-reset e-mail — arrive in our template and in that user's
 * language.
 *
 * Keycloak 26.3.2 (the version the repo runs) loads `src/email` as a folder
 * theme, exactly the files keycloakify packs into the JAR, and sends to a
 * Mailpit container on the same Docker network. Everything reached from the
 * test process is on loopback. Needs Docker, like tedrisat's e2e suites.
 */
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EMAIL_LANGUAGES,
  EMAIL_THEME_DIR,
  format,
  readMessages,
} from "./email-theme";

const KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak:26.3.2";
const MAILPIT_IMAGE = "axllent/mailpit:v1.27";
const THEME = "medaris-keycloak-theme";
const REALM = "mdrs-100";
const REALM_DISPLAY_NAME = "Medrese";

type Mail = { Subject: string; HTML: string; Text: string };

describe("e-mail theme in Keycloak (e2e)", () => {
  let network: StartedNetwork;
  let keycloak: StartedTestContainer;
  let mailpit: StartedTestContainer;
  let kcUrl: string;
  let mailUrl: string;

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

  const adminApi = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${kcUrl}/admin/realms${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await adminToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(
        `${method} ${path} → ${response.status} ${await response.text()}`
      );
    }
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };

  const createUser = async (lang: string, suffix: string) => {
    const username = `${suffix}-${lang}`;
    await adminApi("POST", `/${REALM}/users`, {
      username,
      email: `${username}@medaris.test`,
      firstName: "Test",
      lastName: "User",
      enabled: true,
      emailVerified: false,
      attributes: { locale: [lang] },
    });
    const [user] = await adminApi(
      "GET",
      `/${REALM}/users?exact=true&username=${username}`
    );
    return { id: user.id as string, username, attributes: user.attributes };
  };

  /** Waits for the one message sent to `address`, then reads it whole. */
  const mailTo = async (address: string): Promise<Mail> => {
    for (let attempt = 0; attempt < 60; attempt++) {
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
    throw new Error(`no e-mail to ${address}`);
  };

  beforeAll(async () => {
    network = await new Network().start();
    mailpit = await new GenericContainer(MAILPIT_IMAGE)
      .withNetwork(network)
      .withNetworkAliases("mailpit")
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
      .withBindMounts([
        {
          source: EMAIL_THEME_DIR,
          target: `/opt/keycloak/themes/${THEME}/email`,
          mode: "ro",
        },
      ])
      .withCommand(["start-dev"])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/realms/master", 8080))
      .withStartupTimeout(180_000)
      .start();
    kcUrl = `http://localhost:${keycloak.getMappedPort(8080)}`;

    await adminApi("POST", "", {
      realm: REALM,
      displayName: REALM_DISPLAY_NAME,
      enabled: true,
      emailTheme: THEME,
      resetPasswordAllowed: true,
      internationalizationEnabled: true,
      supportedLocales: ["tr", "en", "ar"],
      defaultLocale: "tr",
      smtpServer: {
        host: "mailpit",
        port: "1025",
        from: "noreply@medaris.test",
        fromDisplayName: REALM_DISPLAY_NAME,
      },
    });
  }, 300_000);

  afterAll(async () => {
    await keycloak?.stop();
    await mailpit?.stop();
    await network?.stop();
  });

  it.each(
    EMAIL_LANGUAGES
  )("sends the verification e-mail in our template, in %s", async (lang) => {
    const messages = readMessages(lang);
    const user = await createUser(lang, "verify");
    // The theme is picked per user; a dropped attribute would test nothing.
    expect(user.attributes?.locale).toEqual([lang]);

    await adminApi("PUT", `/${REALM}/users/${user.id}/send-verify-email`);
    const mail = await mailTo(`${user.username}@medaris.test`);

    expect(mail.Subject).toBe(messages.emailVerificationSubject);
    expect(mail.HTML).toContain(
      `<html lang="${lang}" dir="${messages.emailDirection}">`
    );
    expect(mail.HTML).toContain(messages.emailVerificationTitle);
    expect(mail.HTML).toContain(messages.emailVerificationButton);
    expect(mail.HTML).toContain(
      format(messages.emailVerificationIntro ?? "", REALM_DISPLAY_NAME)
    );
    expect(mail.HTML).toContain("background-color:#0c4a6e");
    expect(mail.HTML).toMatch(
      /<p dir="ltr"[^>]*><a href="http[^"]+\/login-actions\/action-token\?key=/
    );
    expect(mail.Text).toContain(
      (messages.emailVerificationBody ?? "")
        .split("\n")[0]
        ?.replace("{2}", REALM_DISPLAY_NAME)
    );
    // Keycloak words the link lifetime itself ("12 saat", "12 ساعة").
    if (lang !== "en") {
      expect(mail.Text).not.toMatch(/\b(?:seconds?|minutes?|hours?|days?)\b/);
    }
  }, 60_000);

  it.each(
    EMAIL_LANGUAGES
  )("sends the password-reset e-mail in our template, in %s", async (lang) => {
    const messages = readMessages(lang);
    const user = await createUser(lang, "reset");

    // The "forgot password" form, as a browser would submit it. `fetch`
    // keeps no cookie jar, so the auth-session cookies are carried by hand.
    const start = await fetch(
      `${kcUrl}/realms/${REALM}/login-actions/reset-credentials?client_id=account-console`,
      { redirect: "manual" }
    );
    const cookies = start.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const form = await start.text();
    const action = form.match(/action="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(action, "reset-credentials form").toBeDefined();
    const submit = await fetch(action as string, {
      method: "POST",
      headers: {
        Cookie: cookies,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ username: user.username }),
      redirect: "manual",
    });
    expect(submit.status).toBeLessThan(400);

    const mail = await mailTo(`${user.username}@medaris.test`);
    expect(mail.Subject).toBe(messages.passwordResetSubject);
    expect(mail.HTML).toContain(
      `<html lang="${lang}" dir="${messages.emailDirection}">`
    );
    expect(mail.HTML).toContain(messages.passwordResetTitle);
    expect(mail.HTML).toContain(messages.passwordResetButton);
    expect(mail.HTML).toContain(
      format(messages.passwordResetIntro ?? "", REALM_DISPLAY_NAME)
    );
  }, 60_000);

  it("still sends the e-mails it inherits from base", async () => {
    // execute-actions is not overridden: it imports base's template.ftl, which
    // a template.ftl in this theme would shadow.
    const user = await createUser("tr", "inherited");
    await adminApi("PUT", `/${REALM}/users/${user.id}/execute-actions-email`, [
      "UPDATE_PASSWORD",
    ]);
    const mail = await mailTo(`${user.username}@medaris.test`);
    expect(mail.HTML).toContain("/login-actions/action-token?key=");
    expect(mail.HTML).not.toContain("background-color:#0c4a6e");
  }, 60_000);
});
