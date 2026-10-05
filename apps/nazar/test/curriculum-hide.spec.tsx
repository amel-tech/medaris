// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hideErrorKey, weekRows } from "~/features/curriculum-hide/curriculum";
import { cleanup, click, render, settle } from "./dom";
import { html, textOf, translatorFor } from "./server-render";

/**
 * Müfredat of a course, the part that hides (MDRS-143): the live weeks and
 * sessions with "Gizle", the question before it, and what each answer of the API
 * does to the page. The read and the actions are stubs.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  asked: [] as unknown[],
};
const refresh = vi.fn();
const hideWeek = vi.fn();
const hideSession = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
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
    await call({
      courses: {
        getCourseById: async (request: unknown) => {
          state.asked.push(request);
        },
      },
    });
    return state.course;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/curriculum-hide/actions", () => ({
  hideWeek: (courseId: string, weekId: string) => hideWeek(courseId, weekId),
  hideSession: (id: string) => hideSession(id),
}));

const lesson = (id: string, title: string, order: number, at?: string) => ({
  id,
  title,
  orderIndex: order,
  type: "LIVE",
  scheduledAt: at ? new Date(at) : null,
});
const course = {
  weeks: [
    {
      id: "w-2",
      weekNumber: 2,
      orderIndex: 1,
      title: "İkinci bâb",
      lessons: [],
    },
    {
      id: "w-1",
      weekNumber: 1,
      orderIndex: 0,
      title: "Birinci bâb",
      lessons: [
        lesson("s-2", "İkinci celse", 1),
        lesson("s-1", "Açılış celsesi", 0, "2026-10-03T18:00:00Z"),
      ],
    },
  ],
};

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

const importPage = () =>
  import("~/features/curriculum-hide/components/curriculum-page");
const markup = async () => {
  const { CurriculumPage } = await importPage();
  return html(wrap(<CurriculumPage courseId="c-1" />));
};
const mount = async () => {
  const { CurriculumPage } = await importPage();
  const { expand } = await import("./server-render");
  await render(wrap(await expand(<CurriculumPage courseId="c-1" />)));
  await settle(40);
};
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const byLabel = (label: string) =>
  document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const question = () =>
  document.querySelector("[role=alertdialog]") as HTMLElement | null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.course = { status: "ok", data: course };
  state.asked = [];
  for (const fn of [refresh, hideWeek, hideSession]) fn.mockReset();
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("the rows", () => {
  const t = translatorFor("nazar");
  const where = {
    locale: "tr",
    timeZone: "Europe/Istanbul",
    now: new Date("2026-10-02T12:00:00+03:00"),
  };

  it("put the weeks and the sessions in their own order, and date a session that has a time", () => {
    const rows = weekRows(course.weeks as never, t, where);
    expect(rows.map((r) => [r.id, r.number, r.sessions.length])).toEqual([
      ["w-1", 1, 2],
      ["w-2", 2, 0],
    ]);
    expect(rows[0]?.sessions.map((s) => s.id)).toEqual(["s-1", "s-2"]);
    expect(rows[0]?.sessions[0]?.when).toBe("3 Eki 21:00");
    expect(rows[0]?.sessions[1]?.when).toBeNull();
  });

  it("word a refused hide from the API's code", () => {
    expect(hideErrorKey("WEEK_NOT_FOUND")).toBe("CurriculumHide.gone");
    expect(hideErrorKey("LESSON_NOT_FOUND")).toBe("CurriculumHide.gone");
    expect(hideErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(hideErrorKey("")).toBe("Problems.actionGeneric");
  });
});

describe("Müfredat", () => {
  it("is headed with its sentence and reads the course once", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Müfredat<\/h1>/);
    expect(textOf(out)).toContain("Haftaları ve celseleri buradan gizlersiniz");
    expect(state.asked).toEqual([{ id: "c-1" }]);
  });

  it("lists each week with its sessions and a 'Gizle' on every one", async () => {
    const out = await markup();
    const text = textOf(out);
    expect(text).toContain("Hafta 1: Birinci bâb");
    expect(text).toContain("2 celse");
    expect(text).toContain("Açılış celsesi");
    expect(text).toContain("Bu haftada celse yok.");
    for (const label of [
      "Haftayı gizle: Birinci bâb",
      "Haftayı gizle: İkinci bâb",
      "Celseyi gizle: Açılış celsesi",
      "Celseyi gizle: İkinci celse",
    ]) {
      expect(out).toContain(`aria-label="${label}"`);
    }
    expect(out.indexOf("Hafta 1")).toBeLessThan(out.indexOf("Hafta 2"));
  });

  it("says so when the course has no week", async () => {
    state.course = { status: "ok", data: { weeks: [] } };
    expect(textOf(await markup())).toContain("Bu dersin henüz haftası yok.");
  });

  it("answers a refusal with a notice and a failed read with the retry state", async () => {
    state.course = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
    state.course = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Müfredat okunamadı");
    expect(text).not.toContain("izniniz yok");
  });

  it("draws bars while the course is read", async () => {
    const { CurriculumLoading } = await importPage();
    const out = await html(<CurriculumLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(out.match(/mds-skeleton/g)?.length).toBeGreaterThan(2);
  });
});

describe("'Haftayı gizle'", () => {
  const open = async () => {
    await mount();
    await click(byLabel("Haftayı gizle: Birinci bâb"));
    await settle(60);
  };

  it("asks first, with the focus on 'Vazgeç', and says what leaves and who brings it back", async () => {
    await open();
    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain("Birinci bâb");
    expect(ask.textContent).toContain("içindeki 2 celse dersten kalkar");
    expect(ask.textContent).toContain(
      "gizleyen kademe ya da üstü Arşiv’den geri alır"
    );
    expect(document.activeElement).toBe(button(ask, "Vazgeç"));
    expect(hideWeek).not.toHaveBeenCalled();
  });

  it("hides the week on 'Gizle', says so, and reads the page again", async () => {
    hideWeek.mockResolvedValue({ success: true, data: { hiddenSessions: 2 } });
    await open();
    await click(button(question() as HTMLElement, "Gizle"));
    await settle(80);
    expect(hideWeek).toHaveBeenCalledExactlyOnceWith("c-1", "w-1");
    expect(question()).toBeNull();
    expect(toast("success")).toContain("Hafta gizlendi");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says why when the API refuses, and changes nothing", async () => {
    hideWeek.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await open();
    await click(button(question() as HTMLElement, "Gizle"));
    await settle(80);
    expect(toast("error")).toContain("Hafta gizlenemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("takes a week that is gone as what the person wanted, and reads the page again", async () => {
    hideWeek.mockResolvedValue({ success: false, code: "WEEK_NOT_FOUND" });
    await open();
    await click(button(question() as HTMLElement, "Gizle"));
    await settle(80);
    expect(toast("info")).toContain("Bu hafta ya da celse artık yok.");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("hides nothing on 'Vazgeç'", async () => {
    await open();
    await click(button(question() as HTMLElement, "Vazgeç"));
    await settle(60);
    expect(question()).toBeNull();
    expect(hideWeek).not.toHaveBeenCalled();
  });
});

describe("'Celseyi gizle'", () => {
  const open = async () => {
    await mount();
    await click(byLabel("Celseyi gizle: Açılış celsesi"));
    await settle(60);
  };

  it("asks about the session by name, then hides it by its id", async () => {
    hideSession.mockResolvedValue({ success: true, data: null });
    await open();
    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain("Açılış celsesi dersten kalkar");
    await click(button(ask, "Gizle"));
    await settle(80);
    expect(hideSession).toHaveBeenCalledExactlyOnceWith("s-1");
    expect(hideWeek).not.toHaveBeenCalled();
    expect(toast("success")).toContain("Celse gizlendi");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says why when the API refuses", async () => {
    hideSession.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await open();
    await click(button(question() as HTMLElement, "Gizle"));
    await settle(80);
    expect(toast("error")).toContain("Celse gizlenemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
  });
});
