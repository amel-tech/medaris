import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";

/**
 * What the platform specs put in tedrisat's database (MDRS-181), under random
 * ids, and take out again: an applicant with two köşk applications (one
 * waiting, one waiting too, so a refusal and an acceptance each have their
 * own), a köşk the signed-in nazım manages with one medrese's waiting course
 * request, and a few audit rows of known kinds. Direct SQL, so the specs start
 * from a known page without going through the endpoints they test.
 */
export interface PlatformFixture {
  tail: string;
  applicant: { id: string; name: string };
  applications: [{ id: string; name: string }, { id: string; name: string }];
  koskId: string;
  koskName: string;
  /** a köşk nobody the specs sign in as manages */
  otherKoskId: string;
  madrasahName: string;
  request: { id: string; title: string };
  /** the two tab counts of the köşk applications, counted straight from the table */
  applicationCounts: () => Promise<{ pending: number; decided: number }>;
  applicationRow: (id: string) => Promise<{
    status: string;
    reject_reason: string | null;
    kosk_id: string | null;
  } | null>;
  requestRow: (id: string) => Promise<{
    status: string;
    reject_reason: string | null;
    course_id: string | null;
  } | null>;
  /** audit rows by action, optionally narrowed to one entity */
  auditCount: (action: string, entityId?: string) => Promise<number>;
  /** every audit row, the number of rows the export must carry */
  auditTotal: () => Promise<number>;
  policyRow: (key: string) => Promise<{ enabled: boolean } | null>;
  /** the platform policies are the dev database's own: put them back as found */
  restorePolicies: () => Promise<void>;
  remove: () => Promise<void>;
}

export async function seedPlatform(subs: {
  nazim: string;
  admin: string;
}): Promise<PlatformFixture> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const tail = randomUUID().slice(0, 8);
  const applicantId = randomUUID();
  const koskId = randomUUID();
  const otherKoskId = randomUUID();
  const madrasahId = randomUUID();
  const koskName = `E2E Talep Köşkü ${tail}`;
  const madrasahName = `E2E Talep Medresesi ${tail}`;
  const applicant = { id: applicantId, name: `Hatice Yıldırım ${tail}` };
  const applications: PlatformFixture["applications"] = [
    { id: randomUUID(), name: `Davutpaşa Köşkü ${tail}` },
    { id: randomUUID(), name: `Fındıklı Köşkü ${tail}` },
  ];
  const request = { id: randomUUID(), title: `Usûl-i Fıkıh Okumaları ${tail}` };
  const auditIds = [randomUUID(), randomUUID(), randomUUID()];
  const before = await client.query(
    "select key, enabled from platform_policies"
  );
  try {
    await client.query("begin");
    await client.query(
      "insert into users(id, email, given_name, family_name) values ($1, $2, $3, $4) on conflict (id) do nothing",
      [applicantId, `e2e-${tail}@example.test`, "Hatice", `Yıldırım ${tail}`]
    );
    for (const [i, app] of applications.entries()) {
      await client.query(
        "insert into kosk_applications(id, applicant_id, name, field, summary, reason, email, phone) values ($1, $2, $3, 'FIQH', $4, $5, $6, $7)",
        [
          app.id,
          applicantId,
          app.name,
          "Fıkıh dersleri.",
          "Mahallede ihtiyaç var.",
          `e2e-${tail}@example.test`,
          i === 0 ? "+90 532 000 00 00" : null,
        ]
      );
    }
    await client.query(
      "insert into kosks(id, owner_id, name, field) values ($1, $2, $3, 'Fıkıh')",
      [koskId, subs.nazim, koskName]
    );
    await client.query(
      "insert into kosks(id, owner_id, name) values ($1, $2, $3)",
      [otherKoskId, subs.admin, `E2E Başka Köşk ${tail}`]
    );
    await client.query(
      "insert into role_assignments(user_id, role, scope_type, scope_id, granted_by) values ($1, 'KOSK_NAZIM', 'kosk', $2, $1)",
      [subs.nazim, koskId]
    );
    await client.query(
      "insert into madrasahs(id, handle, name, created_by) values ($1, $2, $3, $4)",
      [madrasahId, `e2e-talep-${tail}`, madrasahName, subs.admin]
    );
    await client.query(
      "insert into course_requests(id, kosk_id, madrasah_id, title, reason, requested_by) values ($1, $2, $3, $4, $5, $6)",
      [
        request.id,
        koskId,
        madrasahId,
        request.title,
        "Medresemizde yer yok.",
        applicantId,
      ]
    );
    // Rows of known kinds, newest first by their own times.
    const rows: [string, string, string, string, Record<string, unknown>][] = [
      [auditIds[0] as string, "user.lookup", "user", applicantId, {}],
      [
        auditIds[1] as string,
        "ban.create",
        "kosk",
        koskId,
        { name: `E2E yasak ${tail}` },
      ],
      [auditIds[2] as string, "user.lookup", "user", applicantId, {}],
    ];
    for (const [i, [id, action, entity, entityId, details]] of rows.entries()) {
      await client.query(
        "insert into audit_log(id, actor_id, action, entity, entity_id, details, created_at) values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval)",
        [id, subs.admin, action, entity, entityId, details, String(i)]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    await client.end();
    throw error;
  }

  return {
    tail,
    applicant,
    applications,
    koskId,
    koskName,
    otherKoskId,
    madrasahName,
    request,
    applicationCounts: async () => {
      const { rows } = await client.query(
        "select count(*) filter (where status = 'PENDING')::int as pending, count(*) filter (where status <> 'PENDING')::int as decided from kosk_applications"
      );
      return rows[0];
    },
    applicationRow: async (id) => {
      const { rows } = await client.query(
        "select status, reject_reason, kosk_id from kosk_applications where id = $1",
        [id]
      );
      return rows[0] ?? null;
    },
    requestRow: async (id) => {
      const { rows } = await client.query(
        "select status, reject_reason, course_id from course_requests where id = $1",
        [id]
      );
      return rows[0] ?? null;
    },
    auditCount: async (action, entityId) => {
      const { rows } = await client.query(
        `select count(*)::int as n from audit_log where action = $1${
          entityId ? " and entity_id = $2" : ""
        }`,
        entityId ? [action, entityId] : [action]
      );
      return rows[0].n;
    },
    auditTotal: async () => {
      const { rows } = await client.query(
        "select count(*)::int as n from audit_log"
      );
      return rows[0].n;
    },
    policyRow: async (key) => {
      const { rows } = await client.query(
        "select enabled from platform_policies where key = $1",
        [key]
      );
      return rows[0] ?? null;
    },
    restorePolicies: async () => {
      await client.query("delete from platform_policies");
      for (const row of before.rows) {
        await client.query(
          "insert into platform_policies(key, enabled) values ($1, $2)",
          [row.key, row.enabled]
        );
      }
    },
    remove: async () => {
      try {
        await client.query("begin");
        await client.query("delete from notifications where user_id = $1", [
          applicantId,
        ]);
        await client.query(
          "delete from audit_log where id = any($1) or entity_id = any($2) or details->>'koskId' = $3",
          [
            auditIds,
            [...applications.map((a) => a.id), request.id, koskId],
            koskId,
          ]
        );
        await client.query("delete from course_requests where kosk_id = $1", [
          koskId,
        ]);
        await client.query(
          "delete from kosk_applications where applicant_id = $1",
          [applicantId]
        );
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [[koskId, madrasahId]]
        );
        await client.query("delete from courses where kosk_id = $1", [koskId]);
        // A köşk the acceptance spec opened from an application is named after it.
        const opened = await client.query(
          "select id from kosks where name = any($1)",
          [applications.map((a) => a.name)]
        );
        const openedIds = opened.rows.map((r) => r.id as string);
        await client.query(
          "delete from role_assignments where scope_id = any($1)",
          [openedIds]
        );
        await client.query("delete from audit_log where entity_id = any($1)", [
          openedIds,
        ]);
        await client.query("delete from kosks where id = any($1)", [
          [koskId, otherKoskId, ...openedIds],
        ]);
        await client.query("delete from madrasahs where id = $1", [madrasahId]);
        await client.query("delete from users where id = $1", [applicantId]);
        await client.query("commit");
      } finally {
        await client.end();
      }
    },
  };
}

/**
 * Designs nizam/15 (köşk başvuruları), nizam/17 (denetim kaydı), nizam/19
 * (platform ayarları) and nizam/39 (ders talepleri) against the running app
 * and API, with real Keycloak sign-ins (MDRS-181). A spec whose account is not
 * in the environment (E2E_<ROLE>_EMAIL, _PASSWORD, _SUB) is skipped.
 *
 * The same rules are covered against a real Postgres with a minted token in
 * tedrisat's `platform-admin.e2e.spec.ts`, which also covers what a browser
 * cannot show: a platform policy turning a new enrolment into a waiting one.
 * This file proves the screens carry them through.
 */
const account = (role: string) => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});
const KOSK_NAZIM = account("KOSK_NAZIM");
const SYSTEM_ADMIN = account("SYSTEM_ADMIN");

const seedable = Boolean(KOSK_NAZIM.sub && SYSTEM_ADMIN.sub);
let fixture: PlatformFixture;

test.beforeEach(async () => {
  if (!seedable) return;
  fixture = await seedPlatform({
    nazim: KOSK_NAZIM.sub as string,
    admin: SYSTEM_ADMIN.sub as string,
  });
});

test.afterEach(async () => {
  await fixture?.restorePolicies();
  await fixture?.remove();
});

async function signIn(
  page: Page,
  who: { email?: string; password?: string }
): Promise<void> {
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/localhost:4001/);
}

// By role, which skips the hidden copy React streams in before it swaps the page.
const item = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(name) });
const tabCount = (page: Page, tab: RegExp) =>
  page.getByRole("tab", { name: tab }).locator(".mds-tab__count");

test("nizam/15 — the tab counts are the table's, and the detail shows the applicant and 'Verilmedi' for a missing phone (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/kosk-basvurulari");

  await expect(
    page.getByRole("heading", { level: 1, name: "Köşk başvuruları" })
  ).toBeVisible();
  const counts = await fixture.applicationCounts();
  await expect(tabCount(page, /^Bekleyen/)).toHaveText(String(counts.pending));
  await expect(tabCount(page, /^Karara bağlanan/)).toHaveText(
    String(counts.decided)
  );

  await item(page, (fixture.applications[1] as { name: string }).name).click();
  const detail = page.getByTestId("application-detail");
  await expect(detail).toContainText(
    (fixture.applications[1] as { name: string }).name
  );
  await expect(detail).toContainText("Karar bekliyor");
  await expect(detail).toContainText(fixture.applicant.name);
  await expect(page.getByTestId("applicant-phone")).toHaveText("Verilmedi");
  await expect(page.getByTestId("same-field")).toBeVisible();
});

test("nizam/15 — seeing the contact details writes an audit row (criterion 5)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  const first = fixture.applications[0];
  const before = await fixture.auditCount(
    "kosk_application.contact_read",
    first.id
  );
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/kosk-basvurulari");
  await item(page, first.name).click();
  await expect(page.getByTestId("applicant-phone")).toHaveText(
    "+90 532 000 00 00"
  );
  expect(
    await fixture.auditCount("kosk_application.contact_read", first.id)
  ).toBeGreaterThan(before);
});

test("nizam/15 — Reddet cannot be sent without a reason, then moves the application to Karara bağlanan (criteria 2, 6)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  const target = fixture.applications[1];
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/kosk-basvurulari");
  await item(page, target.name).click();
  await page.getByRole("button", { name: "Reddet" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Reddet" })).toBeDisabled();
  await dialog.getByLabel(/Ret gerekçesi/).fill("Aynı alanda köşk var.");
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(page.getByText("Başvuru reddedildi")).toBeVisible();
  await expect(item(page, target.name)).toHaveCount(0);

  expect(await fixture.applicationRow(target.id)).toMatchObject({
    status: "REJECTED",
    reject_reason: "Aynı alanda köşk var.",
  });
  await page.getByRole("tab", { name: /^Karara bağlanan/ }).click();
  await expect(item(page, target.name)).toBeVisible();
  // An answered application has no buttons to answer it again.
  await item(page, target.name).click();
  await expect(page.getByRole("button", { name: "Köşkü aç" })).toHaveCount(0);
});

test("nizam/15 — Köşkü aç opens the köşk form with the application's values and accepts it once the köşk exists (criteria 3, 4)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  const target = fixture.applications[0];
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/talepler/kosk-basvurulari");
  await item(page, target.name).click();
  await page.getByRole("button", { name: "Köşkü aç" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: /^Ad/ })).toHaveValue(
    target.name
  );
  await expect(dialog.getByLabel(/^Açıklama/)).toHaveValue("Fıkıh dersleri.");
  // The applicant is the köşk's first nazım, as the form's picker shows.
  await expect(dialog).toContainText(fixture.applicant.name);

  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Köşk aç" }).click();
  await expect(page.getByText("Başvuru kabul edildi")).toBeVisible();

  const row = await fixture.applicationRow(target.id);
  expect(row).toMatchObject({ status: "APPROVED" });
  expect(row?.kosk_id).toBeTruthy();
  await page.getByRole("tab", { name: /^Karara bağlanan/ }).click();
  await expect(item(page, target.name)).toBeVisible();
});

test("nizam/17 — newest first, the kind filter lives in the URL, and the export carries as many rows as the table has (criteria 1, 2, 4)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/denetim-kaydi");
  await expect(
    page.getByRole("heading", { level: 1, name: "Denetim kaydı" })
  ).toBeVisible();
  await expect(page.getByTestId("audit-retention").first()).toContainText(
    "[KVKK saklama süresi]"
  );
  await expect(
    page.getByText(`E2E yasak ${fixture.tail}`).first()
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Ne yaptı" }).click();
  await page.getByRole("option", { name: "Kullanıcı arama" }).click();
  await expect(page).toHaveURL(/type=USER_LOOKUP/);
  await expect(page.getByText(`E2E yasak ${fixture.tail}`)).toHaveCount(0);
  await expect(page.getByRole("row")).not.toHaveCount(0);
  for (const kind of await page
    .locator("tbody tr td:nth-child(3) span.font-semibold")
    .allTextContents()) {
    expect(kind).toBe("Kullanıcı arama");
  }

  // The same address, opened afresh, carries the filter.
  await page.goto("/tr/denetim-kaydi?type=USER_LOOKUP");
  await expect(page.getByRole("combobox", { name: "Ne yaptı" })).toContainText(
    "Kullanıcı arama"
  );

  // The unfiltered export has as many rows as the log had when it was asked for.
  await page.goto("/tr/denetim-kaydi");
  const total = await fixture.auditTotal();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Dışa aktar" }).click(),
  ]);
  const path = await download.path();
  const lines = (await readFile(path, "utf8"))
    .replace(/^﻿/, "")
    .trim()
    .split("\r\n");
  expect(lines.length - 1).toBe(total);
  // The export is itself a row of the log.
  expect(await fixture.auditCount("audit.export")).toBeGreaterThan(0);
});

test("nizam/17 — a köşk nazımı has no audit log: 'Bu bölüm için izniniz yok' (criterion 3)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazımı account");
  await signIn(page, KOSK_NAZIM);
  await page.goto("/tr/denetim-kaydi");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
  await page.goto("/tr/ayarlar/platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
});

test("nizam/19 — a switch is saved at once and written to the log, and the table lists the köşks that apply a rule themselves (criteria 1, 4)", async ({
  page,
}) => {
  test.skip(!seedable || !SYSTEM_ADMIN.password, "no başnazım account");
  const before = await fixture.auditCount("platform_policy.change");
  await signIn(page, SYSTEM_ADMIN);
  await page.goto("/tr/ayarlar/platform");
  await expect(
    page.getByRole("heading", { level: 1, name: "Platform ayarları" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Politikalar nasıl birleşir" })
  ).toBeVisible();

  const policy = page.getByTestId("policy-ALWAYS_REQUIRE_APPROVAL");
  const toggle = policy.getByRole("switch");
  const wasOn = (await toggle.getAttribute("aria-checked")) === "true";
  await toggle.click();
  await expect(
    page.getByText(wasOn ? "Politika kapatıldı" : "Politika açıldı")
  ).toBeVisible();
  expect(await fixture.policyRow("ALWAYS_REQUIRE_APPROVAL")).toMatchObject({
    enabled: !wasOn,
  });
  expect(await fixture.auditCount("platform_policy.change")).toBe(before + 1);
  await expect(toggle).toHaveAttribute("aria-checked", String(!wasOn));

  // The change shows in the audit log as "Politika değişikliği".
  await page.goto("/tr/denetim-kaydi?type=POLICY_CHANGE");
  await expect(page.getByText("Politika değişikliği").first()).toBeVisible();
});

test("nizam/39 — the köşk nazımı sees the medrese's request with its sender and counts both tabs (criterion 1)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazımı account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/ders-talepleri`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ders talepleri" })
  ).toBeVisible();
  await expect(tabCount(page, /^Bekleyen/)).toHaveText("1");
  await item(page, fixture.request.title).click();
  // By role, which skips the hidden copy React streams in.
  const detail = page.getByRole("region", { name: fixture.request.title });
  await expect(detail).toContainText(fixture.request.title);
  await expect(detail).toContainText(fixture.madrasahName);
  await expect(detail).toContainText(fixture.koskName);
  await expect(detail).toContainText("Medresemizde yer yok.");
  await expect(detail).toContainText("Karar bekliyor");
});

test("nizam/39 — Kabul et opens the course form with the request's name (criterion 2)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazımı account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/ders-talepleri`);
  await item(page, fixture.request.title).click();
  await page.getByRole("button", { name: "Kabul et" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/kosks/${fixture.koskId}/courses/new\\?talep=${fixture.request.id}`
    )
  );
  await expect(page.getByLabel(/^Ders adı/)).toHaveValue(fixture.request.title);
});

test("nizam/39 — Reddet needs a reason and moves the request to Karara bağlanan (criteria 3, 4)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazımı account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.koskId}/ders-talepleri`);
  await item(page, fixture.request.title).click();
  await page.getByRole("button", { name: "Reddet" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Reddet" })).toBeDisabled();
  await dialog.getByLabel(/Ret gerekçesi/).fill("Kadro dolu.");
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(page.getByText("Talep reddedildi")).toBeVisible();

  expect(await fixture.requestRow(fixture.request.id)).toMatchObject({
    status: "REJECTED",
    reject_reason: "Kadro dolu.",
  });
  await page.getByRole("tab", { name: /^Karara bağlanan/ }).click();
  await expect(item(page, fixture.request.title)).toBeVisible();
});

test("nizam/39 — a köşk nazımı of another köşk gets 'Bu bölüm için izniniz yok' (criterion 5)", async ({
  page,
}) => {
  test.skip(!seedable || !KOSK_NAZIM.password, "no köşk nazımı account");
  await signIn(page, KOSK_NAZIM);
  await page.goto(`/tr/kosks/${fixture.otherKoskId}/ders-talepleri`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Bu bölüm için izniniz yok" })
  ).toBeVisible();
});
