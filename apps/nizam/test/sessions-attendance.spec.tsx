// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsView } from "~/features/courses/components/sessions-view";
import { cleanup, click, render, settle } from "./dom";

/**
 * "Katılım" on Celseler (nizam 56, MDRS-283): one column says how each session
 * is attended — its meeting link, its live stream and the in-person mark — and
 * flags only a session still ahead with none of them. "Yüz yüze ayarı" sets a
 * session's own mark; a session that is over says whether it has a recording,
 * as plain words.
 */

const actions = vi.hoisted(() => ({
  setLiveStream: vi.fn(),
  patchLesson: vi.fn(),
  cancelSession: vi.fn(),
}));
vi.mock("~/features/courses/actions", () => actions);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({ toast }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

const tr = resources.tr.nizam.Sessions;
const NOW = new Date("2026-10-03T18:14:00Z");

const lesson = (
  id: string,
  at: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  weekId: "w1",
  title: `Celse ${id}`,
  type: "LIVE",
  durationMinutes: 60,
  scheduledAt: at,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  meetingUrl: null,
  inPerson: false,
  inPersonOverride: null,
  hasLiveStream: false,
  ...extra,
});

/**
 * A course with: one session over, one live, one cancelled, and the ones
 * still ahead that `ahead` names (by default one with a link and one with
 * nothing at all).
 */
const courseOf = (
  ahead: ReturnType<typeof lesson>[] = [
    lesson("link", "2026-10-07T18:00:00.000Z", {
      meetingUrl: "https://zoom.us/j/1",
    }),
    lesson("bare", "2026-10-08T18:00:00.000Z"),
  ],
  top: Record<string, unknown> = {}
) =>
  ({
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    version: 3,
    timeZone: "Europe/Istanbul",
    inPerson: false,
    ...top,
    weeks: [
      {
        id: "w1",
        weekNumber: 5,
        title: "Mehmûz fiiller",
        lessons: [
          lesson("past", "2026-09-26T18:00:00.000Z"),
          lesson("live", "2026-10-03T18:00:00.000Z"),
          lesson("gone", "2026-10-04T17:00:00.000Z", {
            cancelledAt: "2026-10-03T05:40:00.000Z",
          }),
          ...ahead,
        ],
      },
    ],
  }) as unknown as CourseDetailResponse;

let host: HTMLElement;

const mount = async (
  course: CourseDetailResponse = courseOf(),
  recordings: Record<string, number> | null = {}
) => {
  host = await render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      <SessionsView
        kosk={{ id: "k1", name: "N" }}
        course={course}
        recordings={recordings}
        liveStreams={null}
        tedrisUrl={null}
      />
    </NextIntlClientProvider>
  );
};

/** The text of the row whose first cell names the session. */
const rowOf = (id: string) =>
  [...host.querySelectorAll("tr")].find((row) =>
    row.textContent?.includes(`Celse ${id}`)
  ) ?? null;
const textOf = (id: string) => rowOf(id)?.textContent ?? "";
const flagged = (id: string) =>
  rowOf(id)?.querySelector("[data-testid=attendance-missing]") != null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  actions.patchLesson.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  refresh.mockReset();
});

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Katılım (nizam 56, MDRS-283)", () => {
  it("is one column instead of the link and the stream", async () => {
    await mount();
    const head = [...host.querySelectorAll("thead")]
      .map((h) => h.textContent)
      .join(" ");
    expect(head).toContain(tr.attendance.column);
    expect(head).not.toContain("Toplantı bağlantısı");
    expect(head).not.toContain("Canlı yayın");
  });

  it("flags a session still ahead with none of the three, and names the platform of one with a link", async () => {
    await mount();
    expect(flagged("bare")).toBe(true);
    expect(textOf("bare")).toContain(tr.attendance.missing);
    expect(textOf("link")).toContain("Zoom");
    expect(flagged("link")).toBe(false);
  });

  it("covers a session that is only streamed", async () => {
    await mount(
      courseOf([
        lesson("stream", "2026-10-08T18:00:00.000Z", { hasLiveStream: true }),
      ])
    );
    expect(textOf("stream")).toContain(tr.attendance.streamOnly);
    expect(flagged("stream")).toBe(false);
  });

  it("covers a session of a course held in person, and one marked in person on its own", async () => {
    await mount(
      courseOf(
        [
          lesson("course", "2026-10-08T18:00:00.000Z", { inPerson: true }),
          lesson("own", "2026-10-09T18:00:00.000Z", {
            inPerson: true,
            inPersonOverride: true,
          }),
        ],
        { inPerson: true }
      )
    );
    for (const id of ["course", "own"]) {
      expect(textOf(id)).toContain(tr.attendance.inPerson);
      expect(flagged(id)).toBe(false);
    }
    expect(host.querySelector("[data-testid=attendance-missing]")).toBeNull();
  });

  it("says 'Yüz yüze · YouTube yayını' for a session held in person and streamed", async () => {
    await mount(
      courseOf([
        lesson("both", "2026-10-08T18:00:00.000Z", {
          inPerson: true,
          hasLiveStream: true,
        }),
      ])
    );
    expect(textOf("both")).toContain(
      `${tr.attendance.inPerson} · ${tr.attendance.stream}`
    );
  });

  it("flags a session taken out of an in-person course when it has nothing else", async () => {
    await mount(
      courseOf(
        [
          lesson("out", "2026-10-08T18:00:00.000Z", {
            inPerson: false,
            inPersonOverride: false,
          }),
        ],
        { inPerson: true }
      )
    );
    expect(flagged("out")).toBe(true);
  });

  it("does not flag a session that is under way or over: it says 'Eklenmedi' in plain words", async () => {
    await mount();
    expect(textOf("live")).toContain(tr.attendance.none);
    expect(textOf("past")).toContain(tr.attendance.none);
    expect(flagged("live")).toBe(false);
    expect(flagged("past")).toBe(false);
  });

  it("claims nothing for a content-locked read, which carries no attendance", async () => {
    const locked = courseOf();
    for (const week of locked.weeks) {
      for (const l of week.lessons) {
        const open = l as unknown as Record<string, unknown>;
        delete open.meetingUrl;
        delete open.inPerson;
        delete open.inPersonOverride;
        delete open.hasLiveStream;
      }
    }
    await mount(locked);
    expect(textOf("bare")).toContain(tr.attendance.unknown);
    expect(host.querySelector("[data-testid=attendance-missing]")).toBeNull();
    // nothing to start the in-person choice from, so it is not offered
    expect(host.innerHTML).not.toContain(tr.inPerson.button);
  });
});

describe("the in-person mark of a session (MDRS-283)", () => {
  const button = (id: string) =>
    [...(rowOf(id)?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === tr.inPerson.button
    );
  const editor = () =>
    host.querySelector<HTMLFormElement>("[data-testid=session-edit]");
  const radio = (label: string) =>
    [...(editor()?.querySelectorAll("label.mds-choice") ?? [])].find(
      (l) => l.querySelector(".mds-choice__label")?.textContent === label
    ) as HTMLElement;
  const picked = (label: string) =>
    radio(label).querySelector("[role=radio]")?.getAttribute("aria-checked") ===
    "true";
  const pick = (label: string) =>
    click(radio(label).querySelector("[role=radio]") as Element);
  const save = () =>
    [...(editor()?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === tr.formSave
    ) as HTMLElement;

  it("is offered on the sessions still standing, not on a cancelled one or one that is over", async () => {
    await mount();
    expect(button("bare")).toBeDefined();
    expect(button("link")).toBeDefined();
    expect(button("live")).toBeDefined();
    expect(button("gone")).toBeUndefined();
    expect(button("past")).toBeUndefined();
    expect(button("bare")?.getAttribute("aria-label")).toBe(
      "8 Eki Per 21:00 celsesinin yüz yüze ayarı"
    );
  });

  it("starts from 'Dersin ayarına uy' and says what the course does", async () => {
    await mount();
    await click(button("bare") as HTMLElement);
    await settle(20);
    expect(editor()?.textContent).toContain(
      "8 Ekim 2026 Perşembe 21:00 celsesinin yüz yüze ayarı"
    );
    expect(picked(tr.inPerson.course)).toBe(true);
    expect(editor()?.textContent).toContain(tr.inPerson.courseNo);
  });

  it("marks the session in person at the course version, says so and reads the page again", async () => {
    actions.patchLesson.mockResolvedValue({
      success: true,
      data: { courseVersion: 4 },
    });
    await mount();
    await click(button("bare") as HTMLElement);
    await settle(20);
    await pick(tr.inPerson.yes);
    await settle(20);
    await click(save());
    await settle(40);
    expect(actions.patchLesson).toHaveBeenCalledExactlyOnceWith(
      "k1",
      "c1",
      "bare",
      { version: 3, inPersonOverride: true }
    );
    expect(toast.success).toHaveBeenCalledWith(tr.inPerson.saved);
    expect(refresh).toHaveBeenCalled();
    expect(editor()).toBeNull();
  });

  it("takes a session out of an in-person course, and puts it back to follow the course with null", async () => {
    actions.patchLesson.mockResolvedValue({
      success: true,
      data: { courseVersion: 4 },
    });
    await mount(
      courseOf(
        [
          lesson("out", "2026-10-08T18:00:00.000Z", {
            inPerson: false,
            inPersonOverride: false,
          }),
        ],
        { inPerson: true }
      )
    );
    await click(button("out") as HTMLElement);
    await settle(20);
    expect(picked(tr.inPerson.no)).toBe(true);
    expect(editor()?.textContent).toContain(tr.inPerson.courseYes);
    await pick(tr.inPerson.course);
    await settle(20);
    await click(save());
    await settle(40);
    expect(actions.patchLesson).toHaveBeenCalledExactlyOnceWith(
      "k1",
      "c1",
      "out",
      { version: 3, inPersonOverride: null }
    );
  });

  it("words a refusal from its code and keeps the form", async () => {
    actions.patchLesson.mockResolvedValue({
      success: false,
      error: "x",
      errorBody: { code: "AUTHZ_FORBIDDEN" },
    });
    await mount();
    await click(button("bare") as HTMLElement);
    await settle(20);
    await pick(tr.inPerson.no);
    await settle(20);
    await click(save());
    await settle(40);
    expect(actions.patchLesson).toHaveBeenCalledExactlyOnceWith(
      "k1",
      "c1",
      "bare",
      { version: 3, inPersonOverride: false }
    );
    expect(toast.error).toHaveBeenCalledWith(
      tr.failed,
      expect.objectContaining({ description: tr.errors.forbidden })
    );
    expect(editor()).not.toBeNull();
  });
});

describe("a session that is over (MDRS-283)", () => {
  it("says 'Kayıt yok' or 'Kaydı var' as plain words, never as a warning", async () => {
    await mount(courseOf(), {});
    expect(textOf("past")).toContain(tr.notRecorded);
    expect(
      rowOf("past")?.querySelector("[data-testid=recording-state]")?.className
    ).toBe("mds-caption");
    await cleanup();
    await mount(courseOf(), { past: 1 });
    expect(textOf("past")).toContain(tr.recorded);
    expect(textOf("past")).not.toContain(tr.notRecorded);
  });

  it("says nothing of recordings when they could not be read", async () => {
    await mount(courseOf(), null);
    expect(textOf("past")).toContain(tr.state.ended);
    expect(textOf("past")).not.toContain(tr.notRecorded);
    expect(textOf("past")).not.toContain(tr.recorded);
  });
});
