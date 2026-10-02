import { resources } from "@medaris/i18n";
import type { BanListResponse, BanResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BansView } from "~/features/bans/components/bans-view";
import {
  banErrorKey,
  bannerRole,
  cannotLiftNote,
  isBlank,
  isRecent,
  type Messages,
  mayBanWholeKosk,
  nextSessionAt,
  scopeParts,
} from "~/features/bans/present";

// The server actions reach for the session and the API; none runs in a render.
vi.mock("~/features/bans/actions", () => ({
  createBan: vi.fn(),
  liftBan: vi.fn(),
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

describe("mayBanWholeKosk (nizam 41: Köşkten de yasakla)", () => {
  const me = (systemAdmin: boolean, manages: string[]) =>
    ({
      roles: { systemAdmin, manages: manages.map((id) => ({ id })) },
    }) as never;

  it("is the köşk's nazım and the başnazım", () => {
    expect(mayBanWholeKosk(me(false, ["k1"]), "k1")).toBe(true);
    expect(mayBanWholeKosk(me(true, []), "k1")).toBe(true);
  });

  it("is not a müderris, another köşk's nazım, or nobody", () => {
    expect(mayBanWholeKosk(me(false, []), "k1")).toBe(false);
    expect(mayBanWholeKosk(me(false, ["k2"]), "k1")).toBe(false);
    expect(mayBanWholeKosk(null, "k1")).toBe(false);
  });
});

describe("the reason (nizam 41/42, criterion 3)", () => {
  it("is blank when empty or only white space", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("  \n\t ")).toBe(true);
    expect(isBlank(" hakaret ")).toBe(false);
  });
});

describe("bannerRole and cannotLiftNote (nizam 42: Yasaklayan)", () => {
  it("names the role and marks the viewer's own bans", () => {
    expect(bannerRole(ban(), null, t)).toBe("Müderris");
    expect(bannerRole(ban(), "m1", t)).toBe("Müderris (siz)");
    expect(bannerRole(ban({ bannedRole: "KOSK_NAZIM" }), "x", t)).toBe(
      "Köşk nazımı"
    );
  });

  it("says Medaris administration alone lifts a Medaris nazımı's ban", () => {
    expect(cannotLiftNote({ bannedRole: "MEDARIS_NAZIM" }, t)).toBe(
      "Bu yasağı yalnız Medaris yönetimi kaldırabilir."
    );
    expect(cannotLiftNote({ bannedRole: "KOSK_NAZIM" }, t)).toBe(
      "Bu yasağı yalnız onu koyan kademe ya da üstü kaldırabilir."
    );
  });
});

describe("isRecent (the Yeni badge)", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  it("is the last 24 hours", () => {
    expect(isRecent({ createdAt: new Date("2026-10-02T09:00:00Z") }, now)).toBe(
      true
    );
    expect(isRecent({ createdAt: new Date("2026-09-30T09:00:00Z") }, now)).toBe(
      false
    );
  });
});

describe("scopeParts (nizam 42: Kapsam)", () => {
  it("reads a course ban as Ders and the course, with its medrese", () => {
    expect(
      scopeParts(
        ban({ madrasahName: "Süleymaniye Medresesi" }),
        "Nûruosmaniye Köşkü",
        t
      )
    ).toEqual({
      label: "Ders",
      detail: ["Avâmil ve Tasrîf", "Süleymaniye Medresesi"],
    });
  });

  it("reads a widened köşk ban as Köşk and where it came from", () => {
    expect(
      scopeParts(
        ban({
          scope: "KOSK",
          courseTitle: null,
          extendedFromCourseTitle: "Emsile ve Bina",
        }),
        "Nûruosmaniye Köşkü",
        t
      )
    ).toEqual({
      label: "Köşk",
      detail: ["Nûruosmaniye Köşkü", "Emsile ve Bina dersinden genişletildi"],
    });
  });
});

describe("banErrorKey", () => {
  it("maps tedrisat's codes and falls back to the generic line", () => {
    expect(banErrorKey({ code: "BAN_LIFT_FORBIDDEN" })).toBe(
      "errors.BAN_LIFT_FORBIDDEN"
    );
    expect(banErrorKey({ code: "WHATEVER" })).toBe("errors.generic");
    expect(banErrorKey(undefined)).toBe("errors.generic");
  });
});

describe("nextSessionAt (nizam 41: the link warning)", () => {
  const now = new Date("2026-10-02T09:00:00Z");
  const course = (lessons: Record<string, unknown>[]) =>
    ({ weeks: [{ lessons }] }) as never;

  it("is the earliest session still to come, cancelled ones skipped", () => {
    expect(
      nextSessionAt(
        course([
          { scheduledAt: "2026-10-01T18:00:00Z" },
          { scheduledAt: "2026-10-04T18:00:00Z", cancelledAt: "2026-10-02" },
          { scheduledAt: "2026-10-07T18:00:00Z" },
          { scheduledAt: "2026-10-09T18:00:00Z" },
          { title: "no schedule" },
        ]),
        now
      )?.toISOString()
    ).toBe("2026-10-07T18:00:00.000Z");
  });

  it("is null when nothing is coming", () => {
    expect(nextSessionAt(course([]), now)).toBeNull();
    expect(nextSessionAt(null, now)).toBeNull();
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

const list = (items: BanResponse[]): BanListResponse => ({
  items,
  activeCount: items.length,
  liftedCount: 2,
  recentCount: 1,
});

describe("BansView (nizam 42)", () => {
  const view = (initial: BanListResponse | null) =>
    render(
      <BansView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        initial={initial}
        viewerId="m1"
        viewerRoleLabel="köşk nazımı"
      />
    );

  it("draws the title, the tabs with their counts and a row per ban", () => {
    const html = view(
      list([ban(), ban({ id: "b2", user: person("u2", "Kerem Ali Yazıcı") })])
    );
    expect(html).toContain("Yasaklamalar");
    expect(html).toContain("Etkin");
    expect(html).toContain("Kaldırılan");
    expect(html).toContain("Ömer Faruk Demirkaya");
    expect(html).toContain("Kerem Ali Yazıcı");
    expect(html).toContain("Celselerde kırıcı mesajlar yazdı.");
    expect(html).toContain("Müderris (siz)");
    expect(html.match(/Yasağı kaldır: /g)).toHaveLength(2);
  });

  it("offers 'Yasağı kaldır' only where the kademe reaches, and says why not otherwise", () => {
    const html = view(
      list([
        ban({
          id: "b9",
          viewerMayLift: false,
          viewerMayExtend: false,
          bannedRole: "MEDARIS_NAZIM",
          user: person("u9", "Kâmil Burak Uzunhasanoğlu"),
        }),
      ])
    );
    expect(html).not.toContain("Yasağı kaldır: Kâmil Burak");
    expect(html).toContain("Bu yasağı yalnız Medaris yönetimi kaldırabilir.");
  });

  it("offers 'Köşkten de yasakla' on a course ban the viewer may widen", () => {
    const html = view(list([ban(), ban({ id: "b3", viewerMayExtend: false })]));
    expect(html.match(/Köşkten de yasakla: /g)).toHaveLength(1);
  });

  it("sets the canvas column widths and keeps both actions on one line (stack-47 round 2)", () => {
    const html = view(list([ban()]));
    for (const w of ["300px", "153px", "142px", "129px", "106px", "289px"]) {
      expect(html).toContain(`--mds-col-w:${w}`);
    }
    expect(html).toContain("flex-nowrap");
  });

  it("draws 'Köşkten de yasakla' ghost beside 'Yasağı kaldır' and outline when alone", () => {
    const both = view(list([ban()]));
    const alone = view(
      list([ban({ viewerMayLift: false, bannedRole: "MEDARIS_NAZIM" })])
    );
    const variantOf = (html: string) =>
      html
        .split("<button")
        .find((tag) => tag.includes('aria-label="Köşkten de yasakla: '))
        ?.split(">")[0] ?? "";
    expect(variantOf(both)).toContain("mds-btn--ghost");
    expect(variantOf(alone)).toContain("mds-btn--outline");
  });

  it("shows the empty state of an empty list", () => {
    expect(view(list([]))).toContain("Etkin yasak yok");
  });

  it("shows the error state with a retry when the first read failed", () => {
    const html = view(null);
    expect(html).toContain("Yasaklar yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });
});

describe("the ban windows' Turkish sentences (stack-47 round 1)", () => {
  const all = resources.tr.nizam as unknown as Record<
    string,
    Record<string, unknown>
  >;
  const tr = {
    BanDialog: all.BanDialog as Record<string, unknown>,
    BansPage: all.BansPage as Record<string, unknown>,
    LiftDialog: all.LiftDialog as Record<string, unknown>,
  };

  it("keeps the köşk name whole in the köşk option", () => {
    expect(String(tr.BanDialog.scopeKoskDesc)).toBe(
      "{kosk}’nün bütün derslerine erişemez ve başvuramaz."
    );
  });

  it("has a köşk-scoped toast body and a role phrase for every role", () => {
    expect(String(tr.BanDialog.savedBodyKosk)).toContain("{kosk}");
    const roles = Object.keys(tr.BansPage.roles as object).sort();
    expect(Object.keys(tr.BansPage.rolePhrases as object).sort()).toEqual(
      roles
    );
    expect((tr.BansPage.rolePhrases as Record<string, string>).MUDERRIS).toBe(
      "dersin müderrisi"
    );
  });

  it("names the talebe in bold and says 'bu derse' in the lift note", () => {
    expect(String(tr.LiftDialog.info)).toContain(
      "<b>{name}</b> bu derse yeniden başvurabilir."
    );
  });
});

describe("the tr, en and ar strings", () => {
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
    "BansPage",
    "BanDialog",
    "LiftDialog",
  ])("%s has the same keys in all three languages", (name) => {
    const tr = flat(sets.tr[name]).sort();
    expect(flat(sets.en[name]).sort()).toEqual(tr);
    expect(flat(sets.ar[name]).sort()).toEqual(tr);
  });
});
