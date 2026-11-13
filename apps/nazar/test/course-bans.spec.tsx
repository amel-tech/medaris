// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BanStatus,
  bansHrefAt,
  courseBanRequest,
  courseBansPath,
  fromKoskBan,
  ofCourse,
  talebeOf,
} from "~/features/bans/bans";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Yasaklamalar of one course: which list it reads (the medrese's narrowed to
 * the course, or the köşk's kept to the course), what its tabs count, and the
 * course's own "Yasakla", which offers only this course's talebe.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  roster: { status: "failed" } as Answer<unknown[]>,
  madrasahBans: {} as Record<string, Answer<unknown>>,
  koskBans: {} as Record<string, Answer<unknown>>,
  asked: [] as Array<{ route: string; request: unknown }>,
};
const refresh = vi.fn();
const replace = vi.fn();
const banFromCourse = vi.fn();

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
  readOnce: async (_what: string, call: (api: unknown) => Promise<unknown>) => {
    let answer: unknown;
    await call({
      courses: {
        getCourseById: async () => {
          answer = state.course;
        },
        getCourseEnrollments: async () => {
          answer = state.roster;
        },
      },
      bans: {
        listMadrasahBans: async (request: { status: string }) => {
          state.asked.push({ route: "madrasah", request });
          answer = state.madrasahBans[request.status];
        },
        listKoskBans: async (request: { status: string }) => {
          state.asked.push({ route: "kosk", request });
          answer = state.koskBans[request.status];
        },
      },
    });
    return answer;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-me", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/bans/actions", () => ({
  banFromCourse: (id: string, request: unknown) => banFromCourse(id, request),
  banPerson: vi.fn(),
  liftBan: vi.fn(),
  escalateBan: vi.fn(),
  requestPermanentBan: vi.fn(),
}));

const COURSE = "c-1";
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
  courseId: COURSE,
  courseTitle: "Bina ve İzhar Şerhi",
  koskName: "Sarf Köşkü",
  madrasahName: "Süleymaniye Medresesi",
  extendedFromCourseId: null,
  extendedFromCourseTitle: null,
  reason: `Gerekçe ${n}`,
  bannedBy: person("u-9", "Fatma Zehra Çelebioğlu"),
  bannedRole: "MUDERRIS",
  createdAt: new Date("2026-09-20T10:00:00+03:00"),
  liftedAt: null,
  liftedBy: null,
  liftReason: null,
  viewerMayLift: true,
  viewerMayEscalate: true,
  viewerMayRequestPermanent: false,
  permanentRequestedAt: null,
  ...over,
});
const koskBan = (n: number, over: Record<string, unknown> = {}) => {
  const {
    viewerMayEscalate: _e,
    viewerMayRequestPermanent: _p,
    permanentRequestedAt: _r,
    ...rest
  } = ban(n, over);
  return { ...rest, viewerMayExtend: false };
};
const list = (items: unknown[]) => ({
  status: "ok" as const,
  data: { items, activeCount: 99, liftedCount: 99, recentCount: 0 },
});
const enrolment = (n: number, over: Record<string, unknown> = {}) => ({
  userId: `t-${n}`,
  courseId: COURSE,
  studentName: `Talebe ${n}`,
  studentEmail: `t-${n}@example.com`,
  progress: 0,
  status: "ENROLLED",
  createdAt: new Date(),
  updatedAt: new Date(),
  ban: null,
  ...over,
});
const course = (madrasah: { id: string; name: string } | null) => ({
  status: "ok" as const,
  data: {
    id: COURSE,
    koskId: "k-1",
    title: "Bina ve İzhar Şerhi",
    madrasah,
  },
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
const element = async (status: BanStatus = "ACTIVE") => {
  const { CourseBansPage } = await import(
    "~/features/bans/components/course-bans-page"
  );
  return wrap(<CourseBansPage courseId={COURSE} status={status} />);
};
const markup = async (status?: BanStatus) => html(await element(status));
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};
const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;

beforeEach(() => {
  state.course = course({ id: "m-1", name: "Süleymaniye Medresesi" });
  state.roster = {
    status: "ok",
    data: [
      enrolment(2),
      enrolment(1, { status: "PENDING" }),
      enrolment(3, { status: "REVOKED" }),
      enrolment(4, { ban: { id: "b-x", scope: "COURSE" } }),
    ],
  };
  state.madrasahBans = {
    ACTIVE: list([ban(1), ban(2)]),
    LIFTED: list([
      ban(3, {
        liftedAt: new Date("2026-09-21T10:00:00+03:00"),
        liftedBy: person("u-me", "Mehmet Emin Işıkoğlu"),
      }),
    ]),
  };
  state.koskBans = {};
  state.asked = [];
  refresh.mockReset();
  replace.mockReset();
  banFromCourse.mockReset();
});
afterEach(async () => {
  await cleanup();
});

describe("the rules of a course's list", () => {
  it("addresses the course's list and its lifted tab", () => {
    expect(courseBansPath(COURSE)).toBe("/ders/c-1/yasaklamalar");
    expect(
      bansHrefAt(courseBansPath(COURSE), { status: "LIFTED", scope: "all" })
    ).toBe("/ders/c-1/yasaklamalar?durum=kaldirilan");
  });

  it("keeps only this course's bans of a köşk's list, without the medrese decisions", () => {
    const rows = ofCourse(
      [
        koskBan(1, { viewerMayLift: true }),
        koskBan(2, { courseId: "c-2" }),
        koskBan(3, { scope: "KOSK", courseId: null }),
      ] as never,
      COURSE
    );
    expect(rows.map((row) => row.id)).toEqual(["b-1"]);
    expect(rows[0]).toMatchObject({
      viewerMayLift: true,
      viewerMayEscalate: false,
      viewerMayRequestPermanent: false,
      permanentRequestedAt: null,
    });
    expect(fromKoskBan(koskBan(5) as never)).not.toHaveProperty(
      "viewerMayExtend"
    );
  });

  it("offers the course's own talebe who are not barred or taken out, once each, by name", () => {
    expect(
      talebeOf(
        [
          enrolment(2),
          enrolment(1, { status: "COMPLETED" }),
          enrolment(2),
          enrolment(3, { status: "REVOKED" }),
          enrolment(4, { ban: { id: "b", scope: "COURSE" } }),
          enrolment(5, { studentName: null, studentEmail: null }),
        ] as never,
        "tr",
        "Bilinmeyen"
      )
    ).toEqual([
      { id: "t-5", name: "Bilinmeyen" },
      { id: "t-1", name: "Talebe 1" },
      { id: "t-2", name: "Talebe 2" },
    ]);
  });

  it("sends a course ban with a trimmed reason", () => {
    expect(courseBanRequest({ userId: "t-1", reason: "  sebep " })).toEqual({
      userId: "t-1",
      scope: "COURSE",
      reason: "sebep",
    });
  });
});

describe("Yasaklamalar of a course", () => {
  it("reads the medrese's list narrowed to the course, both tabs, and counts the course's own", async () => {
    const out = textOf(await markup());
    expect(state.asked).toEqual([
      {
        route: "madrasah",
        request: { id: "m-1", status: "ACTIVE", courseId: COURSE },
      },
      {
        route: "madrasah",
        request: { id: "m-1", status: "LIFTED", courseId: COURSE },
      },
    ]);
    expect(out).toContain("Yasaklamalar");
    expect(out).toContain("Kişi 1");
    expect(out).toContain("Kişi 2");
    expect(out).not.toContain("Kişi 3");
    expect(out).toMatch(/Etkin\s*2/);
    expect(out).toMatch(/Kaldırılan\s*1/);
    expect(out).not.toContain("Bütün kapsamlar");
  });

  it("draws only the actions the API allows on each row", async () => {
    const out = await markup();
    expect(out).toContain('aria-label="Yasağı kaldır: Kişi 1"');
    expect(out).toContain('aria-label="Medreseden de yasakla: Kişi 1"');
    expect(out).not.toContain("Kalıcı yasak talebi aç: Kişi 1");
  });

  it("reads the köşk's list for a course with no medrese and keeps this course's rows", async () => {
    state.course = course(null);
    state.koskBans = {
      ACTIVE: {
        status: "ok",
        data: {
          items: [koskBan(1), koskBan(7, { courseId: "c-2" })],
          activeCount: 2,
          liftedCount: 0,
          recentCount: 0,
        },
      },
      LIFTED: {
        status: "ok",
        data: { items: [], activeCount: 2, liftedCount: 0, recentCount: 0 },
      },
    };
    const raw = await markup();
    const out = textOf(raw);
    expect(state.asked.map((a) => a.route)).toEqual(["kosk", "kosk"]);
    expect(out).toContain("Kişi 1");
    expect(out).not.toContain("Kişi 7");
    expect(out).toMatch(/Etkin\s*1/);
    expect(raw).not.toContain("Medreseden de yasakla");
  });

  it("shows the lifted tab's empty state", async () => {
    state.madrasahBans.LIFTED = list([]);
    const out = await markup("LIFTED");
    expect(out).toContain("mds-empty");
    expect(textOf(out)).toContain("Kaldırılan yasak yok.");
  });

  it("says the page is not theirs when the list is refused, and leaves 'Yasakla' out", async () => {
    state.madrasahBans.ACTIVE = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain(resources.tr.nazar.Problems.forbiddenTitle);
    expect(textOf(out).replaceAll("Yasaklamalar", "")).not.toContain("Yasakla");
    expect(out).not.toContain('data-testid="bans"');
  });

  it("keeps 'Yasakla' off and says why when no talebe can be barred", async () => {
    state.roster = {
      status: "ok",
      data: [enrolment(3, { status: "REVOKED" })],
    };
    const out = await markup();
    expect(textOf(out)).toContain("Bu derste yasaklanabilecek talebe yok.");
  });
});

describe("'Yasakla' of a course", () => {
  it("bars a chosen talebe of this course from it", async () => {
    banFromCourse.mockResolvedValue({ success: true, data: null });
    await mount();
    await click(buttonIn(document, "Yasakla"));
    await settle(80);
    const submit = () => buttonIn(dialog(), "Yasakla");
    expect(submit().disabled).toBe(true);
    await click(dialog().querySelector('[aria-label="Talebe"]') as HTMLElement);
    await settle(40);
    const options = [...document.querySelectorAll("[role=option]")];
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      "Talebe 1",
      "Talebe 2",
    ]);
    await click(options[1] as Element);
    await settle(40);
    await typeInto(
      dialog().querySelector("textarea[name=reason]") as HTMLElement,
      "Celsede reklam paylaştı."
    );
    expect(submit().disabled).toBe(false);
    await click(submit());
    await settle(80);
    expect(banFromCourse).toHaveBeenCalledWith(COURSE, {
      userId: "t-2",
      scope: "COURSE",
      reason: "Celsede reklam paylaştı.",
    });
    expect(refresh).toHaveBeenCalled();
  });
});
