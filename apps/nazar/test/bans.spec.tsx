// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionsOf,
  BLANK,
  banErrorKey,
  banRequest,
  banRows,
  bansHref,
  type Filters,
  filtersOf,
  isRecent,
  listMoved,
  listRequest,
  MADRASAH_SCOPE,
  scopeOptions,
} from "~/features/bans/bans";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Yasaklamalar (nazir 11) as the server renders it, the rules of its rows and
 * actions, and the four decisions that can be taken on it: "Yasakla", "Yasağı
 * kaldır", "Medreseden de yasakla" and "Kalıcı yasak talebi aç". The reads, the
 * portal and the actions are stubs; what is under test is what the page does
 * with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  bans: { status: "failed" } as Answer<unknown>,
  courses: { status: "failed" } as Answer<unknown[]>,
  asked: [] as unknown[],
};
const refresh = vi.fn();
const replace = vi.fn();
const lookupPerson = vi.fn();
const banPerson = vi.fn();
const liftBan = vi.fn();
const escalateBan = vi.fn();
const requestPermanentBan = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      bans: {
        listMadrasahBans: async (request: unknown) => {
          state.asked.push(request);
        },
      },
      madrasahs: { getMadrasahCourses: async () => {} },
    });
    return what.includes("courses") ? state.courses : state.bans;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-me", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/shell/reads", () => ({
  getPortal: async () => ({
    status: "ok",
    scopes: [
      {
        kind: "medrese",
        id: "m-1",
        name: "Süleymaniye Medresesi",
        role: "MEDRESE_BASMUDERRIS",
        isImam: false,
        koskName: null,
      },
    ],
  }),
}));
vi.mock("~/features/nazirs/actions", () => ({
  lookupPerson: (email: string) => lookupPerson(email),
}));
vi.mock("~/features/bans/actions", () => ({
  banPerson: (id: string, request: unknown) => banPerson(id, request),
  liftBan: (id: string, reason: string) => liftBan(id, reason),
  escalateBan: (id: string, reason: string) => escalateBan(id, reason),
  requestPermanentBan: (id: string, reason: string) =>
    requestPermanentBan(id, reason),
}));

const COURSE_ID = "5b6f8d7e-0c1a-4d3b-8a2e-1f9c3d4e5a6b";
const BINA = { id: "c-1", title: "Bina ve İzhar Şerhi" };
const ISAGUCI = { id: "c-2", title: "İsâgûcî ile mantığa giriş" };

const person = (id: string, name: string) => ({
  id,
  name,
  email: `${id}@example.com`,
});
const ban = (n: number, over: Record<string, unknown> = {}) => ({
  id: `b-${n}`,
  user: person(`u-${n}`, `Kişi ${n}`),
  scope: "COURSE",
  koskId: "k-1",
  courseId: BINA.id,
  courseTitle: BINA.title,
  madrasahName: "Süleymaniye Medresesi",
  extendedFromCourseId: null,
  extendedFromCourseTitle: null,
  reason: `Gerekçe ${n}`,
  bannedBy: person("u-9", "Fatma Zehra Çelebioğlu"),
  bannedRole: "MEDRESE_NAZIR",
  createdAt: new Date("2026-09-20T10:00:00+03:00"),
  liftedAt: null,
  liftedBy: null,
  liftReason: null,
  viewerMayLift: true,
  viewerMayEscalate: true,
  viewerMayRequestPermanent: true,
  permanentRequestedAt: null,
  ...over,
});

/** The four open bans of the canvas. */
const canvas = () => [
  ban(1, {
    user: person("u-1", "Tarık Ziya Yücetürk"),
    reason: "Celselerde sohbet bölümüne ders dışı reklam bağlantıları yazdı.",
    createdAt: new Date("2026-10-02T10:20:00+03:00"),
  }),
  ban(2, {
    user: person("u-2", "Talha Nusret Bozdoğanlı"),
    courseId: ISAGUCI.id,
    courseTitle: ISAGUCI.title,
    reason: "Hesabını başka birine kullandırdı.",
    bannedBy: person("u-8", "Hasan Basri Gündoğdu"),
    bannedRole: "MEDARIS_NAZIM",
    createdAt: new Date("2026-10-01T22:05:00+03:00"),
    viewerMayLift: false,
    viewerMayRequestPermanent: false,
  }),
  ban(3, {
    user: person("u-3", "Muhammed Said Özdemiroğlu"),
    reason: "Ders kayıtlarının bağlantılarını izinsiz paylaştı.",
    bannedBy: person("u-me", "Mehmet Emin Işıkoğlu"),
    bannedRole: "MEDRESE_BASMUDERRIS",
    createdAt: new Date("2026-10-01T21:30:00+03:00"),
  }),
  ban(4, {
    user: person("u-4", "Mustafa Enes Aktaş"),
    scope: "MADRASAH",
    koskId: null,
    courseId: null,
    courseTitle: null,
    reason: "Ders kayıtlarını izinsiz paylaşma.",
    bannedBy: person("u-me", "Mehmet Emin Işıkoğlu"),
    bannedRole: "MEDRESE_BASMUDERRIS",
    createdAt: new Date("2026-09-29T20:30:00+03:00"),
    viewerMayEscalate: false,
    viewerMayRequestPermanent: false,
    permanentRequestedAt: new Date("2026-09-30T09:00:00+03:00"),
  }),
];
const lifted = () => [
  ban(5, {
    user: person("u-5", "Eda Nur Kaplan"),
    liftedAt: new Date("2026-10-01T15:00:00+03:00"),
    liftedBy: person("u-me", "Mehmet Emin Işıkoğlu"),
    liftReason: "Süre doldu, söz verdi.",
    viewerMayLift: false,
  }),
];
const list = (items: unknown[], activeCount = 4, liftedCount = 1) => ({
  status: "ok" as const,
  data: { items, activeCount, liftedCount, recentCount: 2 },
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const element = async (filters: Filters = BLANK) => {
  const { BansPage } = await import("~/features/bans/components/bans-page");
  return wrap(<BansPage madrasahId="m-1" filters={filters} />);
};
const markup = async (filters?: Filters) => html(await element(filters));
const mount = async (filters?: Filters) => {
  await render((await expand(await element(filters))) as ReactElement);
  await settle(40);
};
const rowsOf = (out: string) =>
  out
    .slice(out.indexOf('data-testid="bans"'))
    .split("<tr")
    .slice(2)
    .map(textOf);

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const reason = () =>
  dialog().querySelector("textarea[name=reason]") as HTMLTextAreaElement;

// the evening of the canvas: a ban of 22:05 yesterday is recent, one of 21:30 is not
const NOW = new Date("2026-10-02T21:45:00+03:00");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.bans = list(canvas());
  state.courses = { status: "ok", data: [BINA, ISAGUCI] };
  state.asked = [];
  for (const fn of [
    refresh,
    replace,
    lookupPerson,
    banPerson,
    liftBan,
    escalateBan,
    requestPermanentBan,
  ]) {
    fn.mockReset();
  }
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("what the list asks the API for", () => {
  it("reads the filters of an address and drops a value nobody knows", () => {
    expect(filtersOf({})).toEqual(BLANK);
    expect(filtersOf({ durum: "kaldirilan", kapsam: "medrese" })).toEqual({
      status: "LIFTED",
      scope: MADRASAH_SCOPE,
    });
    expect(filtersOf({ kapsam: COURSE_ID })).toEqual({
      status: "ACTIVE",
      scope: COURSE_ID,
    });
    expect(filtersOf({ durum: "x", kapsam: "bogus" })).toEqual(BLANK);
  });

  it("writes only what is chosen into the address", () => {
    expect(bansHref("m-1", BLANK)).toBe("/medrese/m-1/yasaklamalar");
    expect(bansHref("m-1", { status: "LIFTED", scope: "madrasah" })).toBe(
      "/medrese/m-1/yasaklamalar?durum=kaldirilan&kapsam=medrese"
    );
    expect(bansHref("m-1", { status: "ACTIVE", scope: COURSE_ID })).toBe(
      `/medrese/m-1/yasaklamalar?kapsam=${COURSE_ID}`
    );
  });

  it("asks for the medrese's scope, or for one course, and for neither on 'Bütün kapsamlar'", () => {
    expect(listRequest(BLANK)).toEqual({
      status: "ACTIVE",
      scope: undefined,
      courseId: undefined,
    });
    expect(listRequest({ status: "LIFTED", scope: MADRASAH_SCOPE })).toEqual({
      status: "LIFTED",
      scope: "MADRASAH",
      courseId: undefined,
    });
    expect(listRequest({ status: "ACTIVE", scope: COURSE_ID })).toEqual({
      status: "ACTIVE",
      scope: undefined,
      courseId: COURSE_ID,
    });
  });

  it("lists 'Bütün kapsamlar', 'Medrese düzeyi' and the courses in the filter", () => {
    expect(
      scopeOptions([BINA], translatorFor("nazar")).map((o) => o.label)
    ).toEqual(["Bütün kapsamlar", "Medrese düzeyi", "Bina ve İzhar Şerhi"]);
  });
});

describe("which actions a row offers (criterion 2: kademe → eylem)", () => {
  const t = translatorFor("nazar");
  const may = (over: Record<string, unknown>) =>
    actionsOf(
      {
        liftedAt: null,
        bannedRole: "MEDRESE_NAZIR",
        viewerMayLift: true,
        viewerMayEscalate: true,
        viewerMayRequestPermanent: true,
        ...over,
      } as never,
      t
    );

  it("offers every action the API says the caller may take, and no note", () => {
    expect(may({})).toEqual({
      lift: true,
      escalate: true,
      permanent: true,
      note: null,
    });
  });

  it("leaves the lift out of a Medaris ban and says only Medaris administration may lift it", () => {
    for (const bannedRole of ["MEDARIS_NAZIM", "SYSTEM_ADMIN"]) {
      expect(
        may({
          bannedRole,
          viewerMayLift: false,
          viewerMayRequestPermanent: false,
        })
      ).toEqual({
        lift: false,
        escalate: true,
        permanent: false,
        note: "Bu yasağı yalnız Medaris yönetimi kaldırabilir.",
      });
    }
  });

  it("leaves the lift out of a köşk nazımı's ban and says the placing kademe or above may", () => {
    expect(may({ bannedRole: "KOSK_NAZIM", viewerMayLift: false }).note).toBe(
      "Bu yasağı yalnız onu koyan kademe ya da üstü kaldırabilir."
    );
  });

  it("offers nothing on a lifted ban", () => {
    expect(
      may({
        liftedAt: new Date(),
        viewerMayLift: false,
        bannedRole: "MEDARIS_NAZIM",
      })
    ).toEqual({ lift: false, escalate: false, permanent: false, note: null });
  });

  it("offers an action only where its flag is set, one by one", () => {
    expect(may({ viewerMayEscalate: false }).escalate).toBe(false);
    expect(may({ viewerMayRequestPermanent: false }).permanent).toBe(false);
  });
});

describe("the rows", () => {
  const t = translatorFor("nazar");
  const where = {
    locale: "tr",
    timeZone: "Europe/Istanbul",
    now: NOW,
    madrasahName: "Süleymaniye Medresesi",
    viewerId: "u-me",
  };
  const rows = () => banRows(canvas() as never, t, where);

  it("wears 'Yeni' for the last 24 hours only, and never on a lifted ban (criterion 5)", () => {
    expect(isRecent(new Date("2026-10-01T21:45:01+03:00"), NOW)).toBe(true);
    expect(isRecent(new Date("2026-10-01T21:45:00+03:00"), NOW)).toBe(false);
    expect(rows().map((row) => row.recent)).toEqual([true, true, false, false]);
    expect(
      banRows(
        [
          ban(5, {
            createdAt: new Date("2026-10-02T11:00:00+03:00"),
            liftedAt: new Date(),
            viewerMayLift: false,
          }),
        ] as never,
        t,
        where
      )[0]?.recent
    ).toBe(false);
  });

  it("names who placed it and in what role, and '(siz)' for the viewer", () => {
    expect(rows().map((row) => row.bannedBy)).toEqual([
      { name: "Fatma Zehra Çelebioğlu", role: "Medrese nazırı" },
      { name: "Hasan Basri Gündoğdu", role: "Medaris nazımı" },
      { name: "Mehmet Emin Işıkoğlu", role: "Medrese başmüderrisi (siz)" },
      { name: "Mehmet Emin Işıkoğlu", role: "Medrese başmüderrisi (siz)" },
    ]);
    const admin = banRows(
      [ban(6, { bannedRole: "SYSTEM_ADMIN" })] as never,
      t,
      where
    )[0];
    expect(admin?.bannedBy.role).toBe("Medaris yönetimi");
  });

  it("words the scope: the course, or the whole medrese with where it was widened from", () => {
    const [course, , , madrasah] = rows();
    expect(course?.scope).toEqual({
      kind: "COURSE",
      label: "Ders",
      detail: ["Bina ve İzhar Şerhi"],
    });
    expect(madrasah?.scope).toEqual({
      kind: "MADRASAH",
      label: "Medrese",
      detail: ["Süleymaniye Medresesi’nin bütün dersleri"],
    });
    const widened = banRows(
      [
        ban(7, {
          scope: "MADRASAH",
          courseId: null,
          courseTitle: null,
          extendedFromCourseId: BINA.id,
          extendedFromCourseTitle: BINA.title,
        }),
      ] as never,
      t,
      where
    )[0];
    expect(widened?.scope.detail).toEqual([
      "Süleymaniye Medresesi’nin bütün dersleri",
      "Bina ve İzhar Şerhi dersinden genişletildi",
    ]);
  });

  it("dates a ban the way the canvas does, on the viewer's clock", () => {
    expect(rows().map((row) => row.when.label)).toEqual([
      "Bugün 10:20",
      "Dün 22:05",
      "Dün 21:30",
      "29 Eyl 20:30",
    ]);
  });

  it("marks a ban whose permanent request is waiting", () => {
    expect(rows().map((row) => row.permanentPending)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});

describe("what the dialogs send and what a refusal says", () => {
  it("bars from one course, or from the medrese, with the reason trimmed", () => {
    expect(
      banRequest({ userId: "u-1", scope: "c-1", reason: " neden " })
    ).toEqual({
      userId: "u-1",
      scope: "COURSE",
      courseId: "c-1",
      reason: "neden",
    });
    expect(
      banRequest({ userId: "u-1", scope: MADRASAH_SCOPE, reason: "neden" })
    ).toEqual({ userId: "u-1", scope: "MADRASAH", reason: "neden" });
  });

  it("words every code the API answers with, and an unknown one generically", () => {
    expect(banErrorKey("BAN_NOT_ESCALATABLE")).toBe(
      "Bans.errors.BAN_NOT_ESCALATABLE"
    );
    expect(banErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(banErrorKey("SOMETHING_NEW")).toBe("Problems.actionGeneric");
    expect(banErrorKey("")).toBe("Problems.actionGeneric");
  });

  it("reads the list again where the answer means the row has moved", () => {
    for (const code of [
      "BAN_ALREADY_LIFTED",
      "BAN_NOT_FOUND",
      "BAN_NOT_ESCALATABLE",
      "BAN_PERMANENT_REQUEST_EXISTS",
    ]) {
      expect(listMoved(code), code).toBe(true);
    }
    expect(listMoved("BAN_LIFT_FORBIDDEN")).toBe(false);
    expect(listMoved("AUTHZ_FORBIDDEN")).toBe(false);
  });
});

describe("Yasaklamalar", () => {
  it("is headed, has 'Yasakla' and says who lifts a ban", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Yasaklamalar<\/h1>/);
    expect(textOf(out)).toContain("Yasakla");
    expect(textOf(out)).toContain("Yasağı, koyan kademe ya da üstü kaldırır");
    expect(textOf(out)).toContain(
      "Köşk nazımının ve Medaris yönetiminin koyduğu yasakları kaldıramazsınız; medreseye genişletebilirsiniz."
    );
  });

  it("asks for the active bans, with no scope, and counts both tabs over the whole medrese (criterion 1)", async () => {
    const out = await markup();
    expect(state.asked).toEqual([
      { id: "m-1", status: "ACTIVE", scope: undefined, courseId: undefined },
    ]);
    const nav = out.slice(out.indexOf('aria-label="Yasak durumu"'));
    expect(textOf(nav.slice(nav.indexOf(">") + 1, nav.indexOf("</nav>")))).toBe(
      "Etkin 4 Kaldırılan 1"
    );
    expect(out).toContain('href="/medrese/m-1/yasaklamalar?durum=kaldirilan"');
  });

  it("lists each ban with the person, scope, reason, who placed it and when", async () => {
    const rows = rowsOf(await markup());
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("Tarık Ziya Yücetürk");
    expect(rows[0]).toContain("Yeni");
    expect(rows[0]).toContain("Ders Bina ve İzhar Şerhi");
    expect(rows[0]).toContain("reklam bağlantıları");
    expect(rows[0]).toContain("Fatma Zehra Çelebioğlu Medrese nazırı");
    expect(rows[0]).toContain("Bugün 10:20");
    expect(rows[1]).toContain("Hasan Basri Gündoğdu Medaris nazımı");
    expect(rows[1]).toContain("Dün 22:05");
    expect(rows[2]).toContain("Medrese başmüderrisi (siz)");
    expect(rows[2]).not.toContain("Yeni");
    expect(rows[3]).toContain(
      "Medrese Süleymaniye Medresesi’nin bütün dersleri"
    );
    expect(rows[3]).toContain("Kalıcı yasak talebi bekliyor");
    expect(rows[3]).toContain("29 Eyl 20:30");
  });

  it("draws the actions of each row by its kademe, and the note where there is no lift (criterion 2)", async () => {
    const rows = rowsOf(await markup());
    for (const text of [
      "Yasağı kaldır",
      "Medreseden de yasakla",
      "Kalıcı yasak talebi aç",
    ]) {
      expect(rows[0]).toContain(text);
      expect(rows[2]).toContain(text);
    }
    // a Medaris nazımı's ban cannot be lifted, only widened, and the row says why
    expect(rows[1]).toContain("Medreseden de yasakla");
    expect(rows[1]).not.toContain("Yasağı kaldır");
    expect(rows[1]).not.toContain("Kalıcı yasak talebi aç");
    expect(rows[1]).toContain(
      "Bu yasağı yalnız Medaris yönetimi kaldırabilir."
    );
    // a medrese-wide ban is lifted, not widened, and its request is already open
    expect(rows[3]).toContain("Yasağı kaldır");
    expect(rows[3]).not.toContain("Medreseden de yasakla");
    expect(rows[3]).not.toContain("Kalıcı yasak talebi aç");
    expect(rows[3]).not.toContain("kaldırabilir");
  });

  it("shows the lifted tab with who lifted each ban and why, and no actions (criterion 1)", async () => {
    state.bans = list(lifted());
    const out = await markup({ status: "LIFTED", scope: "all" });
    expect(state.asked).toEqual([
      { id: "m-1", status: "LIFTED", scope: undefined, courseId: undefined },
    ]);
    const rows = rowsOf(out);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Eda Nur Kaplan");
    expect(rows[0]).toContain("Mehmet Emin Işıkoğlu");
    expect(rows[0]).toContain("Süre doldu, söz verdi.");
    expect(rows[0]).not.toContain("Yasağı kaldır");
    expect(rows[0]).not.toContain("Yeni");
    expect(out).toContain('aria-current="page"');
  });

  it("asks the API for the scope or the course chosen", async () => {
    await markup({ status: "ACTIVE", scope: MADRASAH_SCOPE });
    await markup({ status: "ACTIVE", scope: COURSE_ID });
    expect(state.asked).toEqual([
      { id: "m-1", status: "ACTIVE", scope: "MADRASAH", courseId: undefined },
      { id: "m-1", status: "ACTIVE", scope: undefined, courseId: COURSE_ID },
    ]);
  });

  it("says in one sentence that nothing is listed, and what to do about a filter that hides everything", async () => {
    state.bans = list([], 0, 0);
    const empty = textOf(await markup());
    expect(empty).toContain("Etkin yasak yok.");
    state.bans = list([], 4, 1);
    const filtered = textOf(
      await markup({ status: "ACTIVE", scope: MADRASAH_SCOPE })
    );
    expect(filtered).toContain("Bu süzgece uyan yasak yok.");
    expect(filtered).toContain("Süzgeçleri temizle");
  });

  it("keeps the list when only the courses cannot be read", async () => {
    state.courses = { status: "failed" };
    const out = await markup();
    expect(rowsOf(out)).toHaveLength(4);
    expect(textOf(out)).toContain("Bütün kapsamlar");
  });

  it("answers a refusal with a notice, without the list or 'Yasakla'", async () => {
    state.bans = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain('data-testid="bans"');
    expect(textOf(out)).not.toMatch(/Yasakla(?!malar)/);
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.bans = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Yasaklar okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
  });

  it("draws bars while the bans are read", async () => {
    const { BansLoading } = await import(
      "~/features/bans/components/bans-page"
    );
    const out = await html(<BansLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("the filters and the search", () => {
  const choose = async (select: string, option: string) => {
    await click(byLabel(select));
    await settle(40);
    const row = [...document.querySelectorAll("[role=option]")].find(
      (o) => o.textContent?.trim() === option
    );
    await click(row as Element);
    await settle(40);
  };

  it("ask the server for the narrowed list by changing the address, keeping the tab", async () => {
    await mount({ status: "LIFTED", scope: "all" });
    await choose("Kapsam", "Medrese düzeyi");
    expect(replace).toHaveBeenLastCalledWith(
      "/medrese/m-1/yasaklamalar?durum=kaldirilan&kapsam=medrese"
    );
    await choose("Kapsam", "Bina ve İzhar Şerhi");
    expect(replace).toHaveBeenLastCalledWith(
      "/medrese/m-1/yasaklamalar?durum=kaldirilan&kapsam=c-1"
    );
  });

  it("narrow the rows read by name or e-mail with 'Kişi ara'", async () => {
    await mount();
    const field = document.querySelector(
      "input[type=search]"
    ) as HTMLInputElement;
    await typeInto(field, "özdemir");
    const rows = [...document.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Muhammed Said Özdemiroğlu");
    await typeInto(field, "u-4@");
    expect(document.querySelector("tbody")?.textContent).toContain(
      "Mustafa Enes Aktaş"
    );
    await typeInto(field, "yok böyle biri");
    expect(document.querySelector("tbody")?.textContent).toContain(
      "Bu süzgece uyan yasak yok."
    );
  });
});

describe("'Yasağı kaldır' (nazir 11, criterion 4)", () => {
  const open = async (name = "Tarık Ziya Yücetürk") => {
    await mount();
    await click(byLabel(`Yasağı kaldır: ${name}`));
    await settle(80);
  };
  const submit = () => buttonIn(dialog(), "Yasağı kaldır");

  it("shows the ban's summary above a required reason, and keeps the button off until there is one", async () => {
    await open();
    const text = dialog().textContent ?? "";
    expect(text).toContain("Tarık Ziya Yücetürk");
    expect(text).toContain("Ders · Bina ve İzhar Şerhi");
    expect(text).toContain(
      "Fatma Zehra Çelebioğlu, Medrese nazırı · Bugün 10:20"
    );
    expect(text).toContain("reklam bağlantıları");
    expect(text).toContain("Kaldırma gerekçesi");
    expect(submit().disabled).toBe(true);
    await act(async () => {
      reason().focus();
      reason().blur();
    });
    expect(dialog().textContent).toContain("Bir gerekçe yazın.");
    await typeInto(reason(), "  ");
    expect(submit().disabled).toBe(true);
  });

  it("lifts it with the reason trimmed, says so and reads the list again", async () => {
    liftBan.mockResolvedValue({ success: true, data: null });
    await open();
    await typeInto(reason(), "  Süre doldu, söz verdi.  ");
    await click(submit());
    await settle(60);

    expect(liftBan).toHaveBeenCalledExactlyOnceWith(
      "b-1",
      "Süre doldu, söz verdi."
    );
    expect(toast("success")).toContain("Yasak kaldırıldı");
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("keeps the dialog and the reason when the kademe refuses", async () => {
    liftBan.mockResolvedValue({ success: false, code: "BAN_LIFT_FORBIDDEN" });
    await open();
    await typeInto(reason(), "Süre doldu.");
    await click(submit());
    await settle(60);

    expect(toast("error")).toContain("Yasak kaldırılamadı");
    expect(toast("error")).toContain(
      "Bu yasağı yalnız onu koyan kademe ya da üstü kaldırabilir."
    );
    expect(dialog()).not.toBeNull();
    expect(reason().value).toBe("Süre doldu.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes and reads the list again when the ban was lifted meanwhile", async () => {
    liftBan.mockResolvedValue({ success: false, code: "BAN_ALREADY_LIFTED" });
    await open();
    await typeInto(reason(), "Süre doldu.");
    await click(submit());
    await settle(60);

    expect(toast("error")).toContain("Bu yasak zaten kaldırılmış");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("closes on 'Vazgeç' without sending anything", async () => {
    await open();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    expect(dialog()).toBeNull();
    expect(liftBan).not.toHaveBeenCalled();
  });
});

describe("'Medreseden de yasakla' (criterion 3)", () => {
  const open = async () => {
    await mount();
    await click(byLabel("Medreseden de yasakla: Tarık Ziya Yücetürk"));
    await settle(80);
  };

  it("says the whole medrese is closed to the talebe and the course ban stays, and asks for a reason", async () => {
    await open();
    expect(dialog().textContent).toContain(
      "Talebe medresenin bütün derslerine erişemez ve başvuramaz. “Bina ve İzhar Şerhi” dersindeki yasak da sürer."
    );
    expect(dialog().textContent).toContain("Yasaklama gerekçesi");
    expect(buttonIn(dialog(), "Medreseden de yasakla").disabled).toBe(true);
  });

  it("widens the ban with the reason and reads the list again", async () => {
    escalateBan.mockResolvedValue({ success: true, data: null });
    await open();
    await typeInto(reason(), "Başka derslerde de aynı davranış.");
    await click(buttonIn(dialog(), "Medreseden de yasakla"));
    await settle(60);

    expect(escalateBan).toHaveBeenCalledExactlyOnceWith(
      "b-1",
      "Başka derslerde de aynı davranış."
    );
    expect(toast("success")).toContain("Medreseden de yasaklandı");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("reads the list again when the ban can no longer be widened", async () => {
    escalateBan.mockResolvedValue({
      success: false,
      code: "BAN_NOT_ESCALATABLE",
    });
    await open();
    await typeInto(reason(), "Neden.");
    await click(buttonIn(dialog(), "Medreseden de yasakla"));
    await settle(60);
    expect(toast("error")).toContain("Bu yasak medreseye genişletilemez");
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("'Kalıcı yasak talebi aç'", () => {
  const open = async () => {
    await mount();
    await click(byLabel("Kalıcı yasak talebi aç: Tarık Ziya Yücetürk"));
    await settle(80);
  };

  it("says the request goes to Medaris administration and the ban stays, and asks for a reason", async () => {
    await open();
    expect(dialog().textContent).toContain(
      "Talep Medaris yönetimine gider. Karar verilene kadar yasak olduğu gibi sürer."
    );
    expect(buttonIn(dialog(), "Talebi aç").disabled).toBe(true);
  });

  it("opens the request with the reason and reads the list again", async () => {
    requestPermanentBan.mockResolvedValue({ success: true, data: null });
    await open();
    await typeInto(reason(), "Üçüncü kez tekrarladı.");
    await click(buttonIn(dialog(), "Talebi aç"));
    await settle(60);

    expect(requestPermanentBan).toHaveBeenCalledExactlyOnceWith(
      "b-1",
      "Üçüncü kez tekrarladı."
    );
    expect(toast("success")).toContain("Kalıcı yasak talebi açıldı");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("reads the list again when a request is already open", async () => {
    requestPermanentBan.mockResolvedValue({
      success: false,
      code: "BAN_PERMANENT_REQUEST_EXISTS",
    });
    await open();
    await typeInto(reason(), "Neden.");
    await click(buttonIn(dialog(), "Talebi aç"));
    await settle(60);
    expect(toast("error")).toContain("zaten açılmış");
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("'Yasakla' on the page (nazir 11)", () => {
  const open = async () => {
    await mount();
    await click(buttonIn(document.body, "Yasakla"));
    await settle(80);
  };
  const search = async (address: string) => {
    const field = dialog().querySelector(
      "input[type=email]"
    ) as HTMLInputElement;
    await typeInto(field, address);
    await key(field, "Enter");
    await settle(40);
  };
  const found = {
    kind: "found",
    person: {
      id: "u-9",
      name: "Ayşe Nur Kılıçarslan",
      email: "a.kilicarslan@example.com",
    },
  };
  const submit = () => buttonIn(dialog(), "Yasakla");

  it("asks who is to be barred first, and offers the medrese's courses and the whole medrese", async () => {
    await open();
    expect(dialog().querySelector("input[type=email]")).not.toBeNull();
    expect(submit().disabled).toBe(true);
    const labels = [...dialog().querySelectorAll("[role=radio]")].map((r) =>
      r.closest("label")?.textContent?.trim()
    );
    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain("Bina ve İzhar Şerhi");
    expect(labels[1]).toContain("İsâgûcî ile mantığa giriş");
    expect(labels[2]).toContain("Medrese düzeyi");
  });

  it("searches the person by their exact e-mail address and says when there is no one", async () => {
    lookupPerson.mockResolvedValueOnce({ kind: "none" });
    await open();
    await search("kimse@example.com");
    expect(lookupPerson).toHaveBeenCalledExactlyOnceWith("kimse@example.com");
    expect(dialog().textContent).toContain(
      "Bu e-posta adresiyle kayıtlı bir hesap bulunamadı."
    );
    expect(submit().disabled).toBe(true);
  });

  it("bars the person found from the chosen course, with the reason trimmed", async () => {
    lookupPerson.mockResolvedValue(found);
    banPerson.mockResolvedValue({ success: true, data: null });
    await open();
    await search("a.kilicarslan@example.com");
    expect(dialog().textContent).toContain("Ayşe Nur Kılıçarslan");
    await click([...dialog().querySelectorAll("[role=radio]")][1] as Element);
    await typeInto(reason(), "  Derste taciz.  ");
    await click(submit());
    await settle(60);

    expect(banPerson).toHaveBeenCalledExactlyOnceWith("m-1", {
      userId: "u-9",
      scope: "COURSE",
      courseId: "c-2",
      reason: "Derste taciz.",
    });
    expect(toast("success")).toContain(
      "Ayşe Nur Kılıçarslan artık “İsâgûcî ile mantığa giriş” dersine erişemez."
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers only the whole medrese when the courses cannot be read", async () => {
    state.courses = { status: "failed" };
    await open();
    const radios = [...dialog().querySelectorAll("[role=radio]")];
    expect(radios).toHaveLength(1);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    expect(dialog().textContent).toContain(
      "Dersler okunamadı; yalnız medrese düzeyinde yasaklayabilirsiniz."
    );
  });
});
