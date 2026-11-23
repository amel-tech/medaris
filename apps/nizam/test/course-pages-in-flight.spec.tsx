// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseSettingsPage } from "~/features/courses/components/course-settings-page";
import { CurriculumEditor } from "~/features/courses/components/curriculum-editor";
import { SessionsView } from "~/features/courses/components/sessions-view";
import { cleanup, click, render, settle, type } from "./dom";

/**
 * A course's pages while a write is on its way. Müfredat cannot be edited
 * while it is sent, since the answer replaces the form (NCURR-2); on Ders
 * ayarları Yayımla, Taslağa çek and Dersi gizle wait for Kaydet, and the form
 * waits for Yayımla; on Celseler a form left open beneath "İptal et" closes
 * with the cancel of its celse, which then takes no link or time. The server
 * actions are stubs, held open by hand where the order matters.
 */

const actions = vi.hoisted(() => ({
  saveCurriculum: vi.fn(),
  patchCourse: vi.fn(),
  patchLesson: vi.fn(),
  setCourseMuderris: vi.fn(),
  readCourse: vi.fn(),
  setLiveStream: vi.fn(),
  cancelSession: vi.fn(),
}));
vi.mock("~/features/courses/actions", () => actions);
vi.mock("~/features/kosks/actions", () => ({ updateKosk: vi.fn() }));
vi.mock("~/features/kosks/course-actions", () => ({
  hideCourse: vi.fn(),
  restoreCourse: vi.fn(),
}));
vi.mock("~/features/madrasahs/actions", () => ({ lookupUserByEmail: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** A server action answer the test releases when it chooses. */
const deferred = <T,>() => {
  let settleIt: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settleIt = resolve;
  });
  return { promise, settle: settleIt };
};

const wrap = (node: ReactElement) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={
      { common: resources.tr.common, nizam: resources.tr.nizam } as never
    }
  >
    {node}
  </NextIntlClientProvider>
);

const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const sendForm = async (form: HTMLFormElement) => {
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
  await settle();
};
/** Off as the browser sees it: its own `disabled`, or a disabled fieldset around it. */
const off = (el: Element | null | undefined) =>
  Boolean(
    el &&
      ((el as HTMLButtonElement).disabled ||
        el.closest("fieldset[disabled]") !== null)
  );

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Müfredat while Kaydet sends the course (NCURR-2)", () => {
  const course = {
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    description: "Sarf",
    coverHue: 20,
    version: 3,
    timeZone: "Europe/Istanbul",
    contentLocked: false,
    inPerson: false,
    muderris: [],
    resources: [],
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        title: "Mehmûz fiiller",
        summary: "",
        lessons: [],
      },
    ],
  } as unknown as CourseDetailResponse;

  it("has every field and row button off until the answer, then on again", async () => {
    const saved = deferred<unknown>();
    actions.saveCurriculum.mockReturnValue(saved.promise);
    await render(
      wrap(<CurriculumEditor kosk={{ id: "k1", name: "N" }} course={course} />)
    );
    await type(field("title"), "Emsile ve Bina Okumaları");
    const fields = document.querySelector(
      '[data-testid="curriculum-fields"]'
    ) as HTMLFieldSetElement;
    expect(fields.disabled).toBe(false);

    await sendForm(
      document.querySelector('[data-testid="curriculum"]') as HTMLFormElement
    );
    expect(actions.saveCurriculum).toHaveBeenCalledOnce();
    expect(fields.disabled).toBe(true);
    for (const control of [
      field("title"),
      field("description"),
      button("Hafta ekle"),
    ]) {
      expect(off(control)).toBe(true);
    }
    // the tone radios are Base UI's, off by their own prop
    for (const radio of document.querySelectorAll(
      '[data-testid="curriculum-fields"] [role="radio"]'
    )) {
      expect(radio.getAttribute("aria-disabled")).toBe("true");
    }

    saved.settle({
      success: true,
      data: { ...course, title: "Emsile ve Bina Okumaları", version: 4 },
    });
    await settle();
    expect(fields.disabled).toBe(false);
    expect(field("title").value).toBe("Emsile ve Bina Okumaları");
  });
});

describe("Ders ayarları while a write runs", () => {
  const kosk = {
    id: "k1",
    name: "Nûruosmaniye Köşkü",
    alwaysRequireApproval: false,
    recordingsNeverPublic: false,
  } as unknown as KoskResponse;
  const draft = {
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    status: "DRAFT",
    version: 3,
    timeZone: "Europe/Istanbul",
    isClosed: false,
    requiresApproval: true,
    inPerson: false,
    muderris: [],
    resources: [],
    weeks: [],
  } as unknown as CourseDetailResponse;
  const tr = resources.tr.nizam.CourseSettings;
  const choice = (label: string) =>
    [...document.querySelectorAll("label.mds-choice")].find(
      (l) => l.querySelector(".mds-choice__label")?.textContent === label
    ) as HTMLElement;
  const box = (label: string) =>
    choice(label).querySelector("[role=checkbox]") as HTMLElement;
  const mount = () =>
    render(
      wrap(
        <CourseSettingsPage
          kosk={kosk}
          course={draft}
          enrolledCount={0}
          manager
          tedrisUrl={null}
        />
      )
    );

  it("keeps Yayımla and Dersi gizle off while Kaydet's writes run", async () => {
    const patched = deferred<unknown>();
    actions.patchCourse.mockReturnValue(patched.promise);
    await mount();
    await click(choice(tr.inPersonLabel));
    await settle();
    expect(button(tr.publish).disabled).toBe(false);
    await sendForm(button(tr.save).closest("form") as HTMLFormElement);
    expect(actions.patchCourse).toHaveBeenCalledOnce();

    expect(button(tr.publish).disabled).toBe(true);
    expect(button(tr.hide).disabled).toBe(true);
    await click(button(tr.publish));
    expect(actions.patchCourse).toHaveBeenCalledOnce();

    patched.settle({ success: true, data: draft });
    await settle();
    expect(button(tr.publish).disabled).toBe(false);
    expect(button(tr.hide).disabled).toBe(false);
  });

  it("keeps the form and Kaydet off while Yayımla's write runs", async () => {
    const published = deferred<unknown>();
    actions.patchCourse.mockReturnValue(published.promise);
    await mount();
    await click(choice(tr.inPersonLabel));
    await settle();
    await click(button(tr.publish));
    expect(actions.patchCourse).toHaveBeenCalledExactlyOnceWith("k1", "c1", {
      status: "PUBLISHED",
    });

    for (const label of [tr.closedLabel, tr.inPersonLabel, tr.approvalLabel]) {
      expect(box(label).getAttribute("aria-disabled"), label).toBe("true");
    }
    expect(button(tr.save).disabled).toBe(true);
    expect(button(tr.cancel).disabled).toBe(true);
    await sendForm(button(tr.save).closest("form") as HTMLFormElement);
    expect(actions.patchCourse).toHaveBeenCalledOnce();

    published.settle({
      success: true,
      data: { ...draft, status: "PUBLISHED" },
    });
    await settle();
    expect(box(tr.inPersonLabel).getAttribute("aria-disabled")).toBeNull();
    expect(button(tr.save).disabled).toBe(false);
  });
});

describe("Celseler: İptal et pressed while a form is open", () => {
  const tr = resources.tr.nizam.Sessions;
  const lesson = (id: string, at: string) => ({
    id,
    weekId: "w1",
    title: `Celse ${id}`,
    type: "LIVE",
    durationMinutes: 60,
    scheduledAt: at,
    isPreview: false,
    orderIndex: 0,
    cancelledAt: null,
    meetingUrl: "https://zoom.us/j/1",
    inPerson: false,
    inPersonOverride: null,
    hasLiveStream: false,
  });
  const course = {
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    version: 3,
    timeZone: "Europe/Istanbul",
    weeks: [
      {
        id: "w1",
        weekNumber: 5,
        title: "Mehmûz fiiller",
        lessons: [
          lesson("one", "2026-10-07T18:00:00.000Z"),
          lesson("two", "2026-10-14T18:00:00.000Z"),
        ],
      },
    ],
  } as unknown as CourseDetailResponse;
  const rowButton = (id: string, label: string) => {
    const row = [...document.querySelectorAll("tr")].find((r) =>
      r.textContent?.includes(`Celse ${id}`)
    );
    return [...(row?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === label
    ) as HTMLButtonElement;
  };
  const form = () =>
    document.querySelector('[data-testid="session-edit"]') as HTMLFormElement;
  const confirm = async () => {
    await settle(50);
    await click(button(tr.cancelConfirm));
    await settle(50);
  };

  const mount = async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T18:14:00Z"));
    actions.cancelSession.mockResolvedValue({
      success: true,
      data: { courseVersion: 4 },
    });
    await render(
      wrap(
        <SessionsView
          kosk={{ id: "k1", name: "N" }}
          course={course}
          recordings={{}}
          liveStreams={null}
          tedrisUrl={null}
        />
      )
    );
  };

  it("closes the form with the cancel of its own celse, so nothing is sent for a cancelled one", async () => {
    await mount();
    await click(rowButton("one", tr.updateLink));
    expect(form()).not.toBeNull();
    await click(rowButton("one", tr.cancel));
    await confirm();

    expect(actions.cancelSession).toHaveBeenCalledExactlyOnceWith(
      "k1",
      "c1",
      "one",
      3
    );
    expect(form()).toBeNull();
    expect(actions.patchLesson).not.toHaveBeenCalled();
  });

  it("keeps a form open for another celse", async () => {
    await mount();
    await click(rowButton("two", tr.changeTime));
    await click(rowButton("one", tr.cancel));
    await confirm();

    expect(actions.cancelSession).toHaveBeenCalledOnce();
    expect(form()).not.toBeNull();
    expect(form().textContent).toContain(tr.formSave);
  });
});
