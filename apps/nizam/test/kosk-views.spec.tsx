import { resources } from "@medaris/i18n";
import type {
  KoskDirectoryItemResponse,
  KoskDirectoryResponse,
  KoskNazimResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { filtersFromParams } from "~/features/kosks/admin-present";
import { KoskSettings } from "~/features/kosks/components/kosk-settings";
import { KosksDirectory } from "~/features/kosks/components/kosks-directory";
import { NazimsView } from "~/features/kosks/components/nazims-view";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/kosks/admin-actions", () => ({
  openKosk: vi.fn(),
  hideKosk: vi.fn(),
  restoreKosk: vi.fn(),
  addKoskNazims: vi.fn(),
}));
vi.mock("~/features/kosks/actions", () => ({ updateKosk: vi.fn() }));
vi.mock("~/features/madrasahs/actions", () => ({ lookupUserByEmail: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

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

const person = (id: string, name: string) => ({ id, name, email: null });

const row = (
  over: Partial<KoskDirectoryItemResponse> = {}
): KoskDirectoryItemResponse => ({
  id: "k1",
  handle: "beyazit",
  name: "Beyazıt Köşkü",
  coverHue: 155,
  field: "Hadis",
  level: "BEGINNER",
  isPrivate: false,
  status: "ACTIVE",
  since: null,
  nazims: [person("u1", "Ayşe Nur Kılıçarslan")],
  courseCount: 2,
  ...over,
});

const directory = (
  items: KoskDirectoryItemResponse[],
  over: Partial<KoskDirectoryResponse> = {}
): KoskDirectoryResponse => ({
  items,
  total: items.length,
  page: 1,
  limit: 12,
  counts: { all: 5, active: 4, passive: 0, hidden: 1 },
  fields: ["Belâgat", "Fıkıh", "Hadis"],
  ...over,
});

const hiddenRow = row({
  id: "k3",
  name: "Kalenderhane Köşkü",
  handle: "kalenderhane",
  status: "HIDDEN",
  since: new Date("2026-09-24T09:00:00Z"),
  courseCount: 0,
});

describe("KosksDirectory (nizam 09)", () => {
  const view = (
    dir: KoskDirectoryResponse | null,
    over: { viewerId?: string | null; chief?: boolean; query?: string } = {}
  ) =>
    render(
      <KosksDirectory
        directory={dir}
        filters={filtersFromParams(over.query ? { q: over.query } : {})}
        viewerId={over.viewerId ?? null}
        chief={over.chief ?? true}
      />
    );

  it("draws the title, the tabs with their counts and the table (criterion 1)", () => {
    const html = view(directory([row(), hiddenRow]));
    expect(html).toContain("Köşkler");
    expect(html).toContain("Bütün köşkler");
    expect(html).toContain("Köşk aç");
    for (const label of ["Tümü", "Etkin", "Pasif", "Gizli"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Beyazıt Köşkü");
    expect(html).toContain("@beyazit");
    expect(html).toContain("Ayşe Nur Kılıçarslan");
  });

  it("offers the Görünürlük chips, and no Alan chips, level select or Alan column (MDRS-252)", () => {
    const html = view(directory([row()]));
    for (const label of ["Listelenen", "Listelenmeyen"]) {
      expect(html).toContain(label);
    }
    for (const gone of [
      "Belâgat",
      "Fıkıh",
      "Hadis",
      "Seviye: tümü",
      ">Alan<",
    ]) {
      expect(html).not.toContain(gone);
    }
  });

  it("gives only the hidden row a 'Geri al' (criterion 3)", () => {
    const html = view(directory([row(), hiddenRow]));
    expect(html).toContain("Geri al: Kalenderhane Köşkü");
    expect(html).not.toContain("Geri al: Beyazıt Köşkü");
    expect(html).toContain("24 Eylül’den beri");
  });

  it("says 'Siz' under the row the viewer manages (criterion 4)", () => {
    expect(view(directory([row()]), { viewerId: "U1" })).toContain(
      '<span class="mds-caption">Siz</span>'
    );
    expect(view(directory([row()]), { viewerId: "u9" })).not.toContain(
      '<span class="mds-caption">Siz</span>'
    );
  });

  it("joins two nazımları with 've'", () => {
    const html = view(
      directory([
        row({
          nazims: [
            person("a", "Ömer Nasuhi Bilmenoğlu"),
            person("b", "Abdullah Nuri Gezginoğlu"),
          ],
        }),
      ])
    );
    expect(html).toContain(
      "Ömer Nasuhi Bilmenoğlu ve Abdullah Nuri Gezginoğlu"
    );
  });

  it("marks an unlisted köşk with 'Listelenmeyen' in its row", () => {
    const html = view(directory([row({ isPrivate: true })]));
    expect(html).toContain("mds-badge");
    expect(html.match(/Listelenmeyen/g)?.length).toBeGreaterThan(1);
  });

  it("shows 'Sonuç yok' for an empty filter result and 'Henüz köşk yok' for no köşk at all (criterion 5)", () => {
    expect(
      view(
        directory([], { counts: { all: 5, active: 4, passive: 0, hidden: 1 } })
      )
    ).toContain("Sonuç yok");
    expect(
      view(
        directory([], { counts: { all: 0, active: 0, passive: 0, hidden: 0 } })
      )
    ).toContain("Henüz köşk yok.");
  });

  it("pages only when there is more than a page (criterion 6)", () => {
    expect(view(directory([row()]))).not.toContain('data-testid="pager"');
    const html = view(directory([row()], { total: 30 }));
    expect(html).toContain('data-testid="pager"');
    expect(html).toContain("1 / 3");
  });

  it("gives a köşk nazımı neither 'Köşk aç' nor 'Arşiv' nor 'Geri al'", () => {
    const html = view(directory([hiddenRow]), { chief: false });
    expect(html).not.toContain("Köşk aç");
    expect(html).not.toContain("Geri al");
    expect(html).not.toContain('href="/tr/arsiv"');
  });

  it("shows the error state with 'Yeniden dene' when the read failed", () => {
    const html = view(null);
    expect(html).toContain("Köşkler yüklenemedi");
    expect(html).toContain("Yeniden dene");
    expect(html).not.toContain("<table");
  });

  it("explains the footnote's three definitions", () => {
    const html = view(directory([row()]));
    expect(html).toContain(
      "Ders sayısı taslak, gizli ve pasif dersleri de içerir."
    );
    expect(html).toContain("Listelenmeyen köşk Keşfet’te ve aramada görünmez");
    expect(html).toContain("Gizlenen köşk, dersleriyle birlikte");
  });
});

const koskBody = (over: Partial<KoskResponse> = {}): KoskResponse =>
  ({
    id: "k1",
    ownerId: "o1",
    managerIds: ["u1"],
    name: "Nûruosmaniye Köşkü",
    handle: "nuruosmaniye",
    description: "Arapça dil ilimlerinin köşkü.",
    coverHue: 250,
    isPrivate: false,
    field: "Arapça dil ilimleri",
    level: "BEGINNER",
    tags: ["Sarf", "Nahiv", "Metin okuma"],
    alwaysRequireApproval: false,
    recordingsNeverPublic: false,
    archivedAt: null,
    verified: false,
    featured: false,
    rating: 0,
    ratingCount: 0,
    courseCount: 7,
    studentCount: 0,
    muderrisCount: 0,
    followerCount: 0,
    isFollowing: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as KoskResponse;

describe("KoskSettings (nizam 24)", () => {
  const view = (over: Partial<KoskResponse> = {}) =>
    render(
      <KoskSettings kosk={koskBody(over)} nazimCount={1} hostingCount={1} />
    );

  it("opens with the köşk's values and a read-only short name (criterion 1)", () => {
    const html = view();
    expect(html).toContain("Köşk ayarları");
    expect(html).toContain('value="Nûruosmaniye Köşkü"');
    expect(html).toContain('value="@nuruosmaniye"');
    expect(html).toContain("readOnly");
    expect(html).toContain('value="Sarf, Nahiv, Metin okuma"');
    expect(html).toContain("Arapça dil ilimlerinin köşkü.");
    expect(html).toContain(
      "Nûruosmaniye Köşkü’nün sayfasında görünen bilgileri"
    );
  });

  it("draws the tabs with their counts and the sections of the design", () => {
    const html = view();
    expect(html).toContain('href="/tr/kosks/k1/ayarlar/nazimlar"');
    expect(html).toContain('href="/tr/kosks/k1/ayarlar/barindirma"');
    for (const text of [
      "Köşk bilgileri",
      "Görünürlük",
      "Listelerde gösterme",
      "Politikalar",
      "Kayıt her zaman onaylı",
      "Ders kayıtları herkese açılamaz",
      "Vazgeç",
      "Kaydet",
      "Köşkü gizle",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("opens with the policies as the köşk holds them", () => {
    const off = view();
    const on = view({ alwaysRequireApproval: true, isPrivate: true });
    // the chosen cover is one checked radio; every checkbox starts off
    expect(off.match(/aria-checked="true"/g)?.length ?? 0).toBe(1);
    expect(on.match(/aria-checked="true"/g)?.length).toBe(3);
  });

  it("has no Alan or Seviye input, and keeps 'Kaydet' off until something changes (MDRS-252)", () => {
    const html = view({ field: "Tefsir & Hadis" });
    expect(html).not.toContain("Tefsir &amp; Hadis");
    expect(html).not.toContain('name="field"');
    expect(html).not.toContain('name="level"');
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*>[^<]*(<[^>]*>)*[^<]*Kaydet/
    );
  });
});

const nazim = (over: Partial<KoskNazimResponse> = {}): KoskNazimResponse => ({
  user: person("u1", "Abdülhamit Karaosmanoğlu"),
  grantedBy: person("a1", "Yusuf Ziya Ertuğrul"),
  grantedByRole: "SYSTEM_ADMIN",
  grantedAt: new Date("2026-08-25T09:00:00Z"),
  endsAt: null,
  ...over,
});

describe("NazimsView (nizam 25 and 21)", () => {
  const view = (
    nazims: KoskNazimResponse[] | null,
    over: { chief?: boolean; viewerId?: string | null } = {}
  ) =>
    render(
      <NazimsView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        nazims={nazims}
        viewerId={over.viewerId ?? "u1"}
        chief={over.chief ?? false}
        hostingCount={1}
      />
    );

  it("lists who gave the post, in what capacity, when and until when (criterion 1, 3)", () => {
    const html = view([nazim()]);
    expect(html).toContain("Köşk nazımları");
    expect(html).toContain("Abdülhamit Karaosmanoğlu");
    expect(html).toContain("Yusuf Ziya Ertuğrul");
    expect(html).toContain("Medaris başnazımı");
    expect(html).toContain("25 Ağustos 2026");
    expect(html).toContain("Süresiz");
    expect(html).toContain("Nûruosmaniye Köşkü’nü yöneten köşk nazımları.");
  });

  it("says 'Siz' under the viewer's own row", () => {
    expect(view([nazim()])).toContain('<span class="mds-caption">Siz</span>');
    expect(view([nazim()], { viewerId: "other" })).not.toContain(
      '<span class="mds-caption">Siz</span>'
    );
  });

  it("shows a term's end as a date", () => {
    expect(
      view([nazim({ endsAt: new Date("2026-12-31T20:59:59Z") })])
    ).toContain("31 Aralık 2026");
  });

  it("has no add or remove button for a köşk nazımı, and says why (criterion 2)", () => {
    const html = view([nazim()]);
    expect(html).not.toContain("Köşk nazımı ekle");
    expect(html).not.toContain("Çıkar");
    expect(html).toContain(
      "Köşk nazımlarını Medaris yönetimi atar; bu listeyi buradan değiştiremezsiniz."
    );
  });

  it("gives the başnazım 'Köşk nazımı ekle' and a way back to the köşk list", () => {
    const html = view([nazim()], { chief: true });
    expect(html).toContain("Köşk nazımı ekle");
    expect(html).toContain('href="/tr/kosks"');
    expect(html).not.toContain("buradan değiştiremezsiniz");
  });

  it("lists what a köşk nazımı can do here, six things and the note", () => {
    const html = view([nazim()]);
    expect(html).toContain("Köşk nazımı bu köşkte");
    expect(html).toContain(
      "Köşk destesi açar; müderrislerin önerilerini alır."
    );
    expect(html).toContain("köşk nazımı bu listeyi değiştirmez");
  });

  it("shows the error state when the read failed, and draws the page without a name", () => {
    const html = render(
      <NazimsView
        koskId="k1"
        koskName=""
        nazims={null}
        viewerId={null}
        chief={false}
      />
    );
    expect(html).toContain("Köşk nazımları yüklenemedi");
    expect(html).toContain("Yeniden dene");
    expect(html).toContain("Bu köşkü yöneten köşk nazımları.");
  });

  it("is empty with its own sentence", () => {
    expect(view([])).toContain("Bu köşkün köşk nazımı yok.");
  });
});
