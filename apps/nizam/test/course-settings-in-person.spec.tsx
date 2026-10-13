// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseSettingsPage } from "~/features/courses/components/course-settings-page";
import { cleanup, click, render, settle } from "./dom";

/**
 * "Celseler yüz yüze yapılır" on Ders ayarları (nizam 34, MDRS-283): the box
 * opens with the course's value, waits for Kaydet like the others, and Kaydet
 * sends it in the course's PATCH only when it changed.
 */

const actions = vi.hoisted(() => ({
  patchCourse: vi.fn(),
  patchLesson: vi.fn(),
  setCourseMuderris: vi.fn(),
  readCourse: vi.fn(),
}));
vi.mock("~/features/courses/actions", () => actions);
vi.mock("~/features/kosks/actions", () => ({ updateKosk: vi.fn() }));
vi.mock("~/features/kosks/course-actions", () => ({
  hideCourse: vi.fn(),
  restoreCourse: vi.fn(),
}));
vi.mock("~/features/madrasahs/actions", () => ({ lookupUserByEmail: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const tr = resources.tr.nizam.CourseSettings;

const kosk = {
  id: "k1",
  name: "Nûruosmaniye Köşkü",
  alwaysRequireApproval: false,
  recordingsNeverPublic: false,
} as unknown as KoskResponse;

const courseOf = (inPerson: boolean) =>
  ({
    id: "c1",
    koskId: "k1",
    title: "Emsile ve Bina",
    status: "PUBLISHED",
    version: 3,
    timeZone: "Europe/Istanbul",
    isClosed: false,
    requiresApproval: true,
    inPerson,
    muderris: [],
    resources: [],
    weeks: [],
  }) as unknown as CourseDetailResponse;

let host: HTMLElement;

const mount = async (inPerson: boolean) => {
  host = await render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={
        { common: resources.tr.common, nizam: resources.tr.nizam } as never
      }
    >
      <CourseSettingsPage
        kosk={kosk}
        course={courseOf(inPerson)}
        enrolledCount={0}
        manager
        tedrisUrl={null}
      />
    </NextIntlClientProvider>
  );
};

const box = () =>
  [...host.querySelectorAll("label.mds-choice")].find(
    (label) =>
      label.querySelector(".mds-choice__label")?.textContent ===
      tr.inPersonLabel
  ) as HTMLElement;
const ticked = () =>
  box().querySelector("[role=checkbox]")?.getAttribute("aria-checked") ===
  "true";
const save = () =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === tr.save
  ) as HTMLButtonElement;
const submit = async () => {
  const form = save().closest("form") as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
  await settle(40);
};

beforeEach(() => {
  actions.patchCourse.mockReset();
  actions.patchLesson.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(async () => {
  await cleanup();
});

describe("Celseler yüz yüze yapılır (MDRS-283)", () => {
  it("opens with the course's value and leaves Kaydet off until it changes", async () => {
    await mount(true);
    expect(ticked()).toBe(true);
    expect(save().disabled).toBe(true);
  });

  it("sends the box alone in the course's PATCH once it is ticked", async () => {
    actions.patchCourse.mockResolvedValue({
      success: true,
      data: courseOf(true),
    });
    await mount(false);
    await click(box());
    await settle(20);
    expect(ticked()).toBe(true);
    expect(save().disabled).toBe(false);
    await submit();
    expect(actions.patchCourse).toHaveBeenCalledExactlyOnceWith("k1", "c1", {
      inPerson: true,
    });
    expect(actions.patchLesson).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(tr.saved, expect.anything());
  });

  it("clears it with false", async () => {
    actions.patchCourse.mockResolvedValue({
      success: true,
      data: courseOf(false),
    });
    await mount(true);
    await click(box());
    await settle(20);
    await submit();
    expect(actions.patchCourse).toHaveBeenCalledExactlyOnceWith("k1", "c1", {
      inPerson: false,
    });
  });
});
