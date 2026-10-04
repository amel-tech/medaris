import { resources } from "@medaris/i18n";
import type { HostingRightResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HostingView } from "~/features/hosting/components/hosting-view";
import {
  canRevoke,
  countWord,
  courseLine,
  coursesActionFor,
  grantable,
  grantedOn,
  granterRole,
  hostingErrorKey,
  koskLocative,
  type Messages,
  openCoursesSummary,
  studentTotal,
} from "~/features/hosting/present";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/hosting/actions", () => ({
  grantHostingRight: vi.fn(),
  revokeHostingRight: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);

const messages = resources.tr.nizam as unknown as Record<string, unknown>;
const messagesOf =
  (namespace: string): Messages =>
  (key, values) =>
    Object.entries(values ?? {}).reduce(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      String(dig(messages[namespace], key))
    );
const page = messagesOf("HostingPage");
const dialog = messagesOf("RevokeDialog");

const course = (
  over: Partial<HostingRightResponse["openCourses"][number]> = {}
): HostingRightResponse["openCourses"][number] => ({
  id: "c1",
  title: "Bina ve İzhar Şerhi",
  status: "PUBLISHED",
  studentCount: 35,
  imamName: "Mehmet Emin Işıkoğlu",
  ...over,
});

describe("openCoursesSummary (nizam 26: '1 yayında · 1 taslak')", () => {
  it("counts the live ones and the drafts", () => {
    expect(
      openCoursesSummary(
        [course(), course({ id: "c2", status: "DRAFT" })],
        page
      )
    ).toBe("1 yayında · 1 taslak");
  });

  it("leaves out a part with none, and is empty with no open course", () => {
    expect(openCoursesSummary([course(), course({ id: "c2" })], page)).toBe(
      "2 yayında"
    );
    expect(openCoursesSummary([course({ status: "DRAFT" })], page)).toBe(
      "1 taslak"
    );
    expect(openCoursesSummary([], page)).toBe("");
  });
});

describe("the withdrawal dialog's numbers (nizam 27)", () => {
  it("adds up the talebe of the open courses", () => {
    expect(
      studentTotal([
        course({ studentCount: 35 }),
        course({ id: "c2", studentCount: 0 }),
      ])
    ).toBe(35);
    expect(studentTotal([])).toBe(0);
  });

  it("writes a course's second line with its talebe and imam", () => {
    expect(courseLine(course(), dialog)).toBe(
      "35 talebe · Mehmet Emin Işıkoğlu, imam"
    );
    expect(courseLine(course({ studentCount: 0 }), dialog)).toBe(
      "Henüz talebe yok · Mehmet Emin Işıkoğlu, imam"
    );
    expect(courseLine(course({ imamName: null }), dialog)).toBe("35 talebe");
  });

  it("keeps the button off with no answer, when there is a question (criterion 2)", () => {
    expect(canRevoke(2, null)).toBe(false);
    expect(canRevoke(2, "KEEP")).toBe(true);
    expect(canRevoke(2, "HIDE")).toBe(true);
  });

  it("has no question, and so sends KEEP, when no course is open", () => {
    expect(canRevoke(0, null)).toBe(true);
    expect(coursesActionFor(0, null)).toBe("KEEP");
    expect(coursesActionFor(0, "HIDE")).toBe("KEEP");
    expect(coursesActionFor(2, null)).toBeNull();
    expect(coursesActionFor(2, "HIDE")).toBe("HIDE");
  });
});

describe("who gave the right, and when (nizam 26: Veren, Tarih)", () => {
  it("names the role, or nothing for a right older than the role was recorded", () => {
    expect(granterRole("SYSTEM_ADMIN", page)).toBe("Medaris başnazımı");
    expect(granterRole("KOSK_NAZIM", page)).toBe("Köşk nazımı");
    expect(granterRole(null, page)).toBe("");
    expect(granterRole(undefined, page)).toBe("");
  });

  it("writes the date in full, in the viewer's zone", () => {
    const opts = { locale: "tr", timeZone: "Europe/Istanbul" };
    expect(grantedOn("2026-09-01T09:00:00Z", opts)).toBe("1 Eylül 2026");
    // 31 Aug 22:30 UTC is already 1 Sep in Istanbul.
    expect(grantedOn("2026-08-31T22:30:00Z", opts)).toBe("1 Eylül 2026");
  });
});

describe("grantable and the error keys", () => {
  it("offers the medreses that do not hold the right yet", () => {
    expect(
      grantable(
        [{ id: "a" }, { id: "b" }, { id: "c" }],
        [{ madrasahId: "b" }]
      ).map((m) => m.id)
    ).toEqual(["a", "c"]);
  });

  it("maps the API's codes and falls back to the generic line", () => {
    expect(hostingErrorKey({ code: "HOSTING_RIGHT_NOT_FOUND" })).toBe(
      "errors.notHeld"
    );
    expect(hostingErrorKey({ code: "MADRASAH_NOT_FOUND" })).toBe(
      "errors.madrasahGone"
    );
    expect(hostingErrorKey({ code: "WHATEVER" })).toBe("errors.generic");
    expect(hostingErrorKey(null)).toBe("errors.generic");
  });
});

const render = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const right = (
  over: Partial<HostingRightResponse> = {}
): HostingRightResponse => ({
  madrasahId: "m1",
  name: "Süleymaniye Medresesi",
  handle: "suleymaniye",
  coverHue: 215,
  headMuderris: { id: "h1", name: "Mehmet Emin Işıkoğlu" },
  grantedBy: { id: "a1", name: "Yusuf Ziya Ertuğrul", role: "SYSTEM_ADMIN" },
  grantedAt: new Date("2026-09-01T09:00:00Z"),
  openCourses: [
    course(),
    course({
      id: "c2",
      title: "Maksûd şerhi",
      status: "DRAFT",
      studentCount: 0,
    }),
  ],
  ...over,
});

describe("HostingView (nizam 26)", () => {
  const view = (rights: HostingRightResponse[] | null) =>
    render(
      <HostingView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        rights={rights}
        madrasahs={[]}
      />
    );

  it("draws the title, the way back, the tabs and the table of rights (criterion 1)", () => {
    const html = view([right()]);
    expect(html).toContain("Barındırma hakları");
    expect(html).toContain("Köşk ayarları");
    expect(html).toContain("Barındırma hakkı ver");
    expect(html).toContain('href="/tr/kosks/k1/ayarlar"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Süleymaniye Medresesi");
    expect(html).toContain("Başmüderris Mehmet Emin Işıkoğlu");
    expect(html).toContain("Yusuf Ziya Ertuğrul");
    expect(html).toContain("Medaris başnazımı");
    expect(html).toContain("1 Eylül 2026");
    expect(html).toContain("1 yayında · 1 taslak");
    expect(html).toContain("Barındırma hakkını geri al: Süleymaniye Medresesi");
  });

  it("draws the settings tabs and the way back to them by default, for whom both pages open for", () => {
    const html = view([right()]);
    expect(html).toContain('href="/tr/kosks/k1/ayarlar/nazimlar"');
    expect(html).toContain("Köşk nazımları");
    expect(html).toContain("Genel");
  });

  it("leaves out the settings tabs and their links when they would be a 403 (MDRS-137)", () => {
    const html = render(
      <HostingView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        rights={[right()]}
        madrasahs={[]}
        settingsTabs={false}
      />
    );
    expect(html).not.toContain('href="/tr/kosks/k1/ayarlar"');
    expect(html).not.toContain("/ayarlar/nazimlar");
    expect(html).not.toContain("Köşk nazımları");
    // The page, its words and both actions are still there.
    expect(html).toContain("Köşk ayarları");
    expect(html).toContain("Barındırma hakları");
    expect(html).toContain("Barındırma hakkı ver");
    expect(html).toContain("Barındırma hakkını geri al: Süleymaniye Medresesi");
  });

  it("says the right gives no authority, and that open courses do not close", () => {
    const html = view([right()]);
    expect(html).toContain("hiçbir yetki vermez");
    expect(html).toContain("Açık dersleri kapanmaz");
  });

  it("is empty with 'Henüz barındırma hakkı yok'", () => {
    expect(view([])).toContain("Henüz barındırma hakkı yok");
  });

  it("shows the error state with 'Yeniden dene' when the read failed", () => {
    const html = view(null);
    expect(html).toContain("Barındırma hakları yüklenemedi");
    expect(html).toContain("Yeniden dene");
    expect(html).not.toContain("<table");
  });

  it("does not guess the role of an old right", () => {
    const html = view([
      right({ grantedBy: { id: "a1", name: "Eski Veren", role: null } }),
    ]);
    expect(html).toContain("Eski Veren");
    expect(html).not.toContain("Medaris başnazımı");
  });

  it("names the köşk in the locative, as the design does (nizam 26)", () => {
    const html = view([right()]);
    expect(html).toContain(
      "Nûruosmaniye Köşkü’nde barındırma hakkı olan medreseler. Bu hak"
    );
    expect(html).not.toContain("Köşkü köşkünün");
  });

  it("still draws the page, without a köşk name, when the API is down", () => {
    const html = render(
      <HostingView koskId="k1" koskName="" rights={null} madrasahs={null} />
    );
    expect(html).toContain("Barındırma hakları yüklenemedi");
    expect(html).toContain("Bu köşkte barındırma hakkı olan medreseler");
    expect(html).not.toContain("Bu bölüm için izniniz yok");
  });
});

describe("koskLocative and countWord (nizam 26, 27 prose)", () => {
  it("ends a Turkish köşk name by how it ends", () => {
    expect(koskLocative("Nûruosmaniye Köşkü", "tr")).toBe(
      "Nûruosmaniye Köşkü’nde"
    );
    expect(koskLocative("Fatih Köşk", "tr")).toBe("Fatih Köşk’te");
    expect(koskLocative("Fatih", "tr")).toBe("Fatih köşkünde");
    expect(koskLocative("Fatih Köşkü", "en")).toBe("Fatih Köşkü");
  });

  it("writes small counts out in Turkish, with a capital at a sentence start", () => {
    expect(countWord(2, "tr")).toBe("iki");
    expect(countWord(2, "tr", true)).toBe("İki");
    expect(countWord(1, "tr", true)).toBe("Bir");
    expect(countWord(11, "tr")).toBe("11");
    expect(countWord(2, "en")).toBe("2");
  });
});
