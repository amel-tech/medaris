import { resources } from "@medaris/i18n";
import { ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { html, textOf, translatorFor } from "./server-render";

/**
 * Medrese ayarları (nazir 04) as the server renders it. The two reads are
 * stubbed; what is under test is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  settings: { status: "failed" } as Answer<unknown>,
  courses: { status: "failed" } as Answer<unknown>,
  me: { timeZone: "Europe/Istanbul" } as { timeZone?: string } | null,
  tedris: "http://localhost:4000" as string | undefined,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/env", () => ({
  env: {
    get TEDRIS_URL() {
      return state.tedris;
    },
  },
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string) =>
    what.includes("settings") ? state.settings : state.courses,
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.me,
}));
vi.mock("~/features/settings/actions", () => ({ saveSettings: vi.fn() }));

const settings = (over: Record<string, unknown> = {}) => ({
  name: "Süleymaniye Medresesi",
  description: "Klasik medrese müfredatını çevrim içi sürdürür.",
  policies: {
    closedCourseRequired: false,
    alwaysApproval: true,
    noPublicRecordings: false,
  },
  updatedAt: new Date("2026-09-29T09:00:00Z"),
  updatedBy: { id: "u", name: "Mehmet Emin Işıkoğlu", email: null },
  ...over,
});

const muderris = (name: string, isImam = false) => ({
  name,
  title: null,
  isImam,
});

const courses = [
  {
    id: "c-1",
    title: "Bina ve İzhar Şerhi",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    status: "PUBLISHED",
    muderris: [
      muderris("Mehmet Emin Işıkoğlu", true),
      muderris("Abdülhamit Karaosmanoğlu"),
    ],
  },
  {
    id: "c-2",
    title: "Maksûd şerhi",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    status: "DRAFT",
    muderris: [muderris("Mehmet Emin Işıkoğlu", true)],
  },
];

const render = async () => {
  const { SettingsPage } = await import(
    "~/features/settings/components/settings-page"
  );
  return html(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <SettingsPage madrasahId="m-1" />
      </ToastProvider>
    </NextIntlClientProvider>
  );
};

beforeEach(() => {
  state.settings = { status: "ok", data: settings() };
  state.courses = { status: "ok", data: courses };
  state.me = { timeZone: "Europe/Istanbul" };
  state.tedris = "http://localhost:4000";
});

describe("Medrese ayarları", () => {
  it("is headed 'Medrese ayarları' and links to the public medrese page in a new tab", async () => {
    const markup = await render();
    expect(markup).toMatch(/<h1[^>]*>Medrese ayarları<\/h1>/);
    const link =
      /<a [^>]*href="http:\/\/localhost:4000\/tr\/madrasahs\/m-1"[^>]*>/.exec(
        markup
      )?.[0];
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(textOf(markup)).toContain(
      "Medrese sayfasını gör (yeni sekmede açılır)"
    );
  });

  it("leaves the link out when Tedris's address is not set", async () => {
    state.tedris = undefined;
    expect(textOf(await render())).not.toContain("Medrese sayfasını gör");
  });

  it("fills the form with what the API holds: name, description, the three policies and the last change", async () => {
    const markup = await render();
    expect(markup).toContain('value="Süleymaniye Medresesi"');
    expect(markup).toContain("Klasik medrese müfredatını çevrim içi sürdürür.");
    const text = textOf(markup);
    for (const label of [
      "Medrese adı",
      "Açıklama",
      "Kapalı ders zorunlu",
      "Kayıt her zaman onaylı",
      "Ders kayıtları herkese açılamaz",
    ]) {
      expect(text, label).toContain(label);
    }
    expect(text).toContain(
      "Politika değişikliği kaydettiğiniz anda geçerli olur ve denetim kaydına yazılır."
    );
    expect(text).toContain("Köşk politikası daha dar olabilir");
    expect(text).toContain(
      "Son değişiklik 29 Eylül 2026 · Mehmet Emin Işıkoğlu"
    );
    // Kaydet waits for a change
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Kaydet<\/button>/);
  });

  it("has no 'Son değişiklik' before the first save", async () => {
    state.settings = {
      status: "ok",
      data: settings({ updatedAt: null, updatedBy: null, description: null }),
    };
    expect(textOf(await render())).not.toContain("Son değişiklik");
  });

  it("shows the four levels a policy passes, in order, the medrese's own marked 'Bu sayfa' (criterion 5)", async () => {
    const markup = await render();
    const tiers = markup.slice(markup.indexOf('data-testid="policy-tiers"'));
    const order = [
      "Medaris",
      "Dersin açıldığı köşk",
      "Süleymaniye Medresesi",
      "Ders ayarları",
    ].map((name) => tiers.indexOf(name));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(textOf(tiers)).toContain(
      "Süleymaniye Medresesi Başmüderris ya da izinli medrese nazırı belirler Bu sayfa"
    );
    expect(textOf(markup)).toContain(
      "Bir izin ancak dört kademenin hepsinde açıksa kullanılır; biri kapatırsa kapalıdır."
    );
  });

  it("lists the courses the policies apply to with their köşk, müderrisler and state", async () => {
    const text = textOf(await render());
    expect(text).toContain("Politikaların uygulandığı dersler");
    expect(text).toContain(
      "Bina ve İzhar Şerhi Nûruosmaniye Köşkü · Mehmet Emin Işıkoğlu, imam ve Abdülhamit Karaosmanoğlu Yayında"
    );
    expect(text).toContain(
      "Maksûd şerhi Nûruosmaniye Köşkü · Mehmet Emin Işıkoğlu, imam Taslak"
    );
    expect(text).toContain("Medrese dersleri");
  });

  it("says so when the medrese has no course, and keeps the form when the courses cannot be read", async () => {
    state.courses = { status: "ok", data: [] };
    expect(textOf(await render())).toContain("Bu medresenin henüz dersi yok.");
    state.courses = { status: "failed" };
    const text = textOf(await render());
    expect(text).toContain(
      "Dersler şu an okunamadı. Sayfayı yenileyerek yeniden deneyin."
    );
    expect(text).toContain("Medrese adı");
  });

  it("answers a refusal with a notice and no form: the API reads nothing for a nazır of the medrese (criterion 4)", async () => {
    state.settings = { status: "forbidden" };
    const markup = await render();
    const text = textOf(markup);
    expect(text).toContain("Medrese ayarları");
    expect(text).toContain("Bu sayfaya izniniz yok");
    expect(markup).not.toContain('data-testid="settings-form"');
    expect(text).not.toContain("Kaydet");
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.settings = { status: "failed" };
    const markup = await render();
    const text = textOf(markup);
    expect(text).toContain("Medrese ayarları okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
    expect(markup).not.toContain('data-testid="settings-form"');
  });

  it("dates 'Son değişiklik' in the viewer's zone", async () => {
    // 22:30 UTC on the 29th is already the 30th in Istanbul, still the 29th in New York
    state.settings = {
      status: "ok",
      data: settings({ updatedAt: new Date("2026-09-29T22:30:00Z") }),
    };
    expect(textOf(await render())).toContain("Son değişiklik 30 Eylül 2026");
    state.me = { timeZone: "America/New_York" };
    expect(textOf(await render())).toContain("Son değişiklik 29 Eylül 2026");
  });
});

describe("while the settings are read", () => {
  it("keeps the shell and draws the form as bars, named for assistive technology", async () => {
    const { SettingsLoading } = await import(
      "~/features/settings/components/settings-page"
    );
    const markup = await html(<SettingsLoading />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("mds-skeleton");
    expect(textOf(markup)).toBe("Yükleniyor");
  });
});
