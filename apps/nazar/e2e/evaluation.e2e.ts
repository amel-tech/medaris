import type { Page } from "@playwright/test";
import {
  type Account,
  account,
  canSignIn,
  directGrant,
  expect,
  test,
} from "./accounts";
import { type EvaluationFixture, seedEvaluation } from "./evaluation-seed";

/**
 * Değerlendirme of a course (MDRS-248) against the running app and API with
 * real Keycloak sign-ins: the müderris (E2E_MUDERRIS_*) opens it from the
 * menu under Ödevler, opens the recited homework and marks the talebe with a
 * press and with a key, "N/M tam" following; a ders nazırı without
 * `session.manage` (E2E_DERS_NAZIR_*) has no menu entry and is refused the
 * page and the API; the talebe (E2E_TALEBE_*) reads their own mark and writes
 * none. The API calls take the direct grant of `accounts.ts`.
 */
const MUDERRIS = account("MUDERRIS");
const DERS_NAZIR = account("DERS_NAZIR");
const TALEBE = account("TALEBE");
const API = process.env.E2E_TEDRISAT_URL ?? "http://localhost:3001";
const desktop = { width: 1440, height: 900 };

let fixture: EvaluationFixture | undefined;

test.beforeAll(async () => {
  if (!MUDERRIS.sub || !DERS_NAZIR.sub || !TALEBE.sub) return;
  fixture = await seedEvaluation({
    muderris: MUDERRIS.sub,
    dersNazir: DERS_NAZIR.sub,
    talebe: TALEBE.sub,
  });
});

test.afterEach(async () => {
  await fixture?.clear();
});

test.afterAll(async () => {
  await fixture?.remove();
});

const seeded = (...who: Account[]) =>
  Boolean(fixture) && who.every((w) => canSignIn(w));

/** tedrisat as `who`, with a token of their own. */
async function api(
  who: Account,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; code?: string; data: unknown }> {
  const token = (await directGrant(who)).access_token;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, code: data?.code ?? data?.error?.code, data };
}

const degerlendirme = async (page: Page) => {
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.courseId}/degerlendirme`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Değerlendirme" })
  ).toBeVisible();
};

test("the müderris marks the talebe on the recited homework with a press and with a key, and the count follows", async ({
  as,
}) => {
  test.skip(!seeded(MUDERRIS), "no müderris account");
  const { recited, files } = fixture as EvaluationFixture;
  const page = await as("MUDERRIS");
  await page.setViewportSize(desktop);
  await page.goto(`/ders/${fixture?.courseId}/odevler`);
  const menu = page.locator("aside");
  await menu.getByRole("link", { name: /^Değerlendirme/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Değerlendirme" })
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: /^Değerlendirme/ })
  ).toHaveAttribute("aria-current", "page");

  // Only the recited homework is a column; its cell waits.
  await expect(page.getByText(`1. hafta · ${files.title}`)).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Bekliyor" })).toBeVisible();
  await page
    .getByRole("button", { name: `1. hafta · ${recited.title}` })
    .click();

  const count = page.getByTestId("evaluation-count");
  await expect(count).toHaveText("0/1 tam");
  const row = page.locator(`[data-testid="evaluation-row-${TALEBE.sub}"]`);
  await row.getByRole("button", { name: "Tam" }).click();
  await expect(count).toHaveText("1/1 tam");
  await expect(row.getByRole("button", { name: "Tam" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect
    .poll(() => fixture?.markOf())
    .toEqual({
      status: "FULL",
      note: null,
    });

  await row.focus();
  await page.keyboard.press("2");
  await expect(count).toHaveText("0/1 tam");
  await expect
    .poll(() => fixture?.markOf())
    .toEqual({
      status: "INCOMPLETE",
      note: null,
    });

  const note = row.getByRole("textbox");
  await note.fill("Son iki satır eksik.");
  await note.press("Enter");
  await expect
    .poll(() => fixture?.markOf())
    .toEqual({
      status: "INCOMPLETE",
      note: "Son iki satır eksik.",
    });

  // The talebe reads their own mark and its note.
  const own = await api(
    TALEBE,
    "GET",
    `/lessons/${recited.lessonId}/evaluation`
  );
  expect(own.status).toBe(200);
  expect(own.data).toMatchObject({
    status: "INCOMPLETE",
    note: "Son iki satır eksik.",
  });
});

test("a ders nazırı without session.manage has no Değerlendirme and is refused the page and the API", async ({
  as,
}) => {
  test.skip(!seeded(DERS_NAZIR), "no ders nazırı account");
  const { recited } = fixture as EvaluationFixture;
  const page = await as("DERS_NAZIR");
  await degerlendirme(page);
  await expect(
    page.getByText("Bu sayfaya izniniz yok").filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.locator("aside").getByRole("link", { name: /^Değerlendirme/ })
  ).toHaveCount(0);

  const board = await api(
    DERS_NAZIR,
    "GET",
    `/courses/${fixture?.courseId}/evaluations`
  );
  expect(board.status).toBe(403);
  const mark = await api(
    DERS_NAZIR,
    "PUT",
    `/lessons/${recited.lessonId}/evaluations/${TALEBE.sub}`,
    { status: "FULL" }
  );
  expect(mark.status).toBe(403);
  expect(await fixture?.markOf()).toBeNull();
});

test("the talebe marks nobody, themselves included, reads no board and hands no file in on a recited homework", async () => {
  test.skip(!seeded(TALEBE), "no talebe account");
  const { recited } = fixture as EvaluationFixture;
  const self = await api(
    TALEBE,
    "PUT",
    `/lessons/${recited.lessonId}/evaluations/${TALEBE.sub}`,
    { status: "FULL" }
  );
  expect(self.status).toBe(403);
  const board = await api(
    TALEBE,
    "GET",
    `/courses/${fixture?.courseId}/evaluations`
  );
  expect(board.status).toBe(403);
  const waiting = await api(
    TALEBE,
    "GET",
    `/lessons/${recited.lessonId}/evaluation`
  );
  expect(waiting.data).toMatchObject({ status: null });

  const token = (await directGrant(TALEBE)).access_token;
  const form = new FormData();
  form.set(
    "file",
    new Blob(["%PDF-1.7\n"], { type: "application/pdf" }),
    "ezber.pdf"
  );
  const upload = await fetch(
    `${API}/lessons/${recited.lessonId}/submission/files`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }
  );
  expect(upload.status).toBe(409);
  expect(((await upload.json()) as { code?: string }).code).toBe(
    "SUBMISSION_FILES_NOT_TAKEN"
  );
  expect(await fixture?.markOf()).toBeNull();
});
