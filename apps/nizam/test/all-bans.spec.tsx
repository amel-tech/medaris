import { resources } from "@medaris/i18n";
import type {
  AllBansListResponse,
  BanResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AllBansView } from "~/features/bans/components/all-bans-view";
import {
  asScopeFilter,
  type Messages,
  nextOffset,
  rowActions,
  scopeParts,
} from "~/features/bans/present";

// The server actions reach for the session and the API; none runs in a render.
vi.mock("~/features/bans/actions", () => ({
  createBan: vi.fn(),
  liftBan: vi.fn(),
  extendBan: vi.fn(),
  loadAllBans: vi.fn(),
  loadKoskBans: vi.fn(),
}));

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);

const messages = resources.tr.nizam as unknown as Record<string, unknown>;
const t: Messages = (key, values) =>
  Object.entries(values ?? {}).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    String(dig(messages.BansPage, key))
  );

const person = (id: string, name: string) => ({
  id,
  name,
  email: `${id}@example.com`,
});

const ban = (over: Partial<BanResponse> = {}): BanResponse =>
  ({
    id: "b1",
    user: person("u1", "Ömer Faruk Demirkaya"),
    scope: "COURSE",
    koskId: "k1",
    koskName: "Nûruosmaniye Köşkü",
    courseId: "c1",
    courseTitle: "Avâmil ve Tasrîf",
    madrasahName: null,
    extendedFromCourseId: null,
    extendedFromCourseTitle: null,
    reason: "Celselerde kırıcı mesajlar yazdı.",
    bannedBy: person("m1", "Ayşe Nur Kılıçarslan"),
    bannedRole: "MUDERRIS",
    createdAt: new Date("2026-10-02T11:32:00Z"),
    liftedAt: null,
    liftedBy: null,
    liftReason: null,
    viewerMayLift: true,
    viewerMayExtend: true,
    ...over,
  }) as BanResponse;

describe("rowActions (nizam 48: the visibility matrix)", () => {
  it("offers both on an open course ban the viewer's kademe reaches", () => {
    expect(rowActions(ban())).toEqual({ lift: true, extend: true });
  });

  it("offers no widening on a köşk ban, the widest scope there is", () => {
    expect(rowActions(ban({ scope: "KOSK", courseId: null }))).toEqual({
      lift: true,
      extend: false,
    });
  });

  it("offers nothing on a lifted ban", () => {
    expect(rowActions(ban({ liftedAt: new Date() }))).toEqual({
      lift: false,
      extend: false,
    });
  });

  it("follows the server's flags for a ban placed above the viewer", () => {
    expect(
      rowActions(ban({ viewerMayLift: false, viewerMayExtend: false }))
    ).toEqual({ lift: false, extend: false });
    expect(rowActions(ban({ viewerMayExtend: false })).extend).toBe(false);
  });
});

describe("the scope filter (nizam 48: Kapsam)", () => {
  it("knows Tümü, Ders and Köşk and falls back to Tümü", () => {
    expect(asScopeFilter("COURSE")).toBe("COURSE");
    expect(asScopeFilter("KOSK")).toBe("KOSK");
    expect(asScopeFilter("")).toBe("");
    expect(asScopeFilter(null)).toBe("");
    expect(asScopeFilter("PLATFORM")).toBe("");
  });

  it("names the köşk under a course when asked, and skips an unnamed medrese", () => {
    expect(scopeParts(ban(), "Nûruosmaniye Köşkü", t, true)).toEqual({
      label: "Ders",
      detail: ["Avâmil ve Tasrîf", "Nûruosmaniye Köşkü"],
    });
    expect(
      scopeParts(
        ban({ madrasahName: "Süleymaniye Medresesi" }),
        "Nûruosmaniye Köşkü",
        t,
        true
      ).detail
    ).toEqual([
      "Avâmil ve Tasrîf",
      "Nûruosmaniye Köşkü",
      "Süleymaniye Medresesi",
    ]);
    expect(scopeParts(ban(), "Nûruosmaniye Köşkü", t).detail).toEqual([
      "Avâmil ve Tasrîf",
    ]);
  });

  it("pages on: the offset is what is loaded until everything is", () => {
    expect(nextOffset(20, 45)).toBe(20);
    expect(nextOffset(45, 45)).toBeNull();
    expect(nextOffset(0, 0)).toBeNull();
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

const list = (items: BanResponse[], total = items.length) =>
  ({
    items,
    total,
    activeCount: 12,
    liftedCount: 3,
    recentCount: 3,
  }) as AllBansListResponse;

describe("AllBansView (nizam 48)", () => {
  const view = (initial: AllBansListResponse | null) =>
    render(
      <AllBansView
        initial={initial}
        viewerId="a1"
        viewerRoleLabel="Medaris yönetimi"
      />
    );

  it("draws the title, the tab counts from the whole platform, the filter and the sentence", () => {
    const html = view(list([ban()], 12));
    expect(html).toContain("Yasaklamalar");
    expect(html).toContain("3 yeni yasak");
    expect(html).toContain("Etkin");
    expect(html).toContain("Kaldırılan");
    expect(html).toContain(">12<");
    expect(html).toContain("12 etkin yasak");
    for (const chip of ["Tümü", "Ders", "Köşk"]) {
      expect(html).toContain(`>${chip}<`);
    }
    expect(html).toContain("Kişi adı ya da e-posta ara");
    expect(html).toContain("Nûruosmaniye Köşkü");
  });

  it("offers 'Yasağı genişlet' only on a course ban whose flag is set, and no widen on a köşk ban", () => {
    const html = view(
      list([
        ban(),
        ban({ id: "b2", viewerMayExtend: false }),
        ban({ id: "b3", scope: "KOSK", courseId: null }),
      ])
    );
    expect(html.match(/Yasağı genişlet: /g)).toHaveLength(1);
    expect(html.match(/Yasağı kaldır: /g)).toHaveLength(3);
  });

  it("says why a row has no lift button", () => {
    const html = view(
      list([
        ban({
          viewerMayLift: false,
          viewerMayExtend: false,
          bannedRole: "MEDARIS_NAZIM",
        }),
      ])
    );
    expect(html).not.toContain("Yasağı kaldır: ");
    expect(html).toContain("Bu yasağı yalnız Medaris yönetimi kaldırabilir.");
  });

  it("shows 'Daha fazla göster' while the list is longer than the page, not after", () => {
    expect(view(list([ban()], 45))).toContain("Daha fazla göster");
    expect(view(list([ban()], 1))).not.toContain("Daha fazla göster");
  });

  it("shows the empty state, and the error state with a retry", () => {
    expect(view(list([], 0))).toContain("Etkin yasak yok");
    const failed = view(null);
    expect(failed).toContain("Yasaklar yüklenemedi");
    expect(failed).toContain("Yeniden dene");
  });
});

describe("the tr, en and ar strings of nizam 48", () => {
  const sets = {
    tr: resources.tr.nizam,
    en: resources.en.nizam,
    ar: resources.ar.nizam,
  } as unknown as Record<"tr" | "en" | "ar", Record<string, unknown>>;
  const flat = (o: unknown, prefix = ""): string[] =>
    o && typeof o === "object"
      ? Object.entries(o).flatMap(([k, v]) => flat(v, `${prefix}${k}.`))
      : [prefix.slice(0, -1)];

  it.each([
    "AllBansPage",
    "ExtendDialog",
  ])("%s has the same keys in all three languages", (name) => {
    const tr = flat(sets.tr[name]).sort();
    expect(tr.length).toBeGreaterThan(5);
    expect(flat(sets.en[name]).sort()).toEqual(tr);
    expect(flat(sets.ar[name]).sort()).toEqual(tr);
  });

  it("keeps the köşk name whole: no suffix is glued to a variable", () => {
    const body = String(
      (sets.tr.ExtendDialog as Record<string, string>).extendedBody
    );
    expect(body).toBe("{name} artık {kosk} içindeki hiçbir derse başvuramaz.");
  });
});
