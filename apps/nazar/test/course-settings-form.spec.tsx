// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoursePublishCard } from "~/features/course-settings/components/course-publish-card";
import { CourseSettingsForm } from "~/features/course-settings/components/course-settings-form";
import type { CourseSettingsControls } from "~/features/course-settings/course-settings";
import { cleanup, click, render, settle } from "./dom";

/**
 * What Ders ayarları sends (MDRS-270): Kaydet carries only what changed, the
 * sample session moves with two session writes in nizam's order, a refusal is
 * worded from its code, and "Taslağa çek" asks first. The actions are stubs.
 */
const refresh = vi.fn();
const saveCourseSettings = vi.fn();
const setSampleLesson = vi.fn();
const setCourseStatus = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/course-settings/actions", () => ({
  saveCourseSettings: (...args: unknown[]) => saveCourseSettings(...args),
  setSampleLesson: (...args: unknown[]) => setSampleLesson(...args),
  setCourseStatus: (...args: unknown[]) => setCourseStatus(...args),
}));

const course = (over: Record<string, unknown> = {}) =>
  ({
    id: "c-1",
    title: "Bina ve İzhar Şerhi",
    status: "PUBLISHED",
    isClosed: false,
    requiresApproval: true,
    timeZone: "Europe/Istanbul",
    version: 7,
    weeks: [
      {
        id: "w1",
        weekNumber: 1,
        lessons: [
          { id: "l-1", title: "Celse 1", type: "LIVE", isPreview: true },
          { id: "l-2", title: "Celse 2", type: "LIVE", isPreview: false },
        ],
      },
    ],
    ...over,
  }) as never;

/** A müderris's controls: everything open (`controlsOf` is pinned in course-settings.spec.ts). */
const OPEN: CourseSettingsControls = {
  closed: "open",
  approval: "open",
  zone: true,
  sample: true,
  publish: true,
  save: true,
  needsEdit: false,
};

const wrap = (node: ReactNode) =>
  render(
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
const mount = (
  over: Record<string, unknown> = {},
  controls: CourseSettingsControls = OPEN
) => wrap(<CourseSettingsForm course={course(over)} controls={controls} />);

const button = (label: string, root: ParentNode = document) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const row = (label: string) =>
  [...document.querySelectorAll("label.mds-choice")].find(
    (l) => l.querySelector(".mds-choice__label")?.textContent === label
  ) as HTMLElement;
const checked = (label: string) =>
  row(label).querySelector("[role=checkbox]")?.getAttribute("aria-checked") ===
  "true";
/** happy-dom does not forward a click on the box to its input; the label does, as the browser's does. */
const toggle = (label: string) => click(row(label));
/** The two selects, in the form's order: Örnek ders, then Saat dilimi. */
const trigger = (which: "sample" | "zone") =>
  [...document.querySelectorAll("button.mds-input")][
    which === "sample" ? 0 : 1
  ] as HTMLElement;
const choose = async (which: "sample" | "zone", label: string) => {
  await click(trigger(which));
  await settle(50);
  const option = [...document.querySelectorAll(".mds-option")].find(
    (o) => o.textContent?.trim() === label
  );
  expect(option, label).toBeDefined();
  await click(option as Element);
  await settle(50);
};
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
/** Kaydet is a submit button; sending the form is what the browser does with a click on it. */
const submit = async () => {
  await click(button("Kaydet"));
  await settle(40);
};

beforeEach(() => {
  for (const fn of [
    refresh,
    saveCourseSettings,
    setSampleLesson,
    setCourseStatus,
  ]) {
    fn.mockReset();
  }
  saveCourseSettings.mockResolvedValue({ success: true, data: { version: 9 } });
  setSampleLesson.mockImplementation(
    async (_id: string, change: { version: number }) => ({
      success: true,
      data: { courseVersion: change.version + 1 },
    })
  );
  setCourseStatus.mockResolvedValue({ success: true, data: { version: 8 } });
});
afterEach(cleanup);

describe("Kaydet and Vazgeç", () => {
  it("keeps Kaydet and Vazgeç off until something differs, and Vazgeç puts the stored values back", async () => {
    await mount();
    expect(button("Kaydet").disabled).toBe(true);
    expect(button("Vazgeç").disabled).toBe(true);
    await toggle("Kapalı ders");
    expect(checked("Kapalı ders")).toBe(true);
    expect(button("Kaydet").disabled).toBe(false);
    await click(button("Vazgeç"));
    expect(checked("Kapalı ders")).toBe(false);
    expect(button("Kaydet").disabled).toBe(true);
    expect(saveCourseSettings).not.toHaveBeenCalled();
  });

  it("sends only what changed to PATCH /courses/:id, touches no session, says so and reads the page again", async () => {
    await mount();
    await toggle("Kapalı ders");
    await toggle("Kayıt onayı gereksin");
    await submit();
    expect(saveCourseSettings).toHaveBeenCalledExactlyOnceWith("c-1", {
      isClosed: true,
      requiresApproval: false,
    });
    expect(setSampleLesson).not.toHaveBeenCalled();
    expect(toast("success")).toContain("Ders ayarları kaydedildi");
    expect(toast("success")).toContain(
      "Bina ve İzhar Şerhi dersinin ayarları güncellendi."
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(button("Kaydet").disabled).toBe(true);
  });

  it("sends a new time zone alone", async () => {
    await mount();
    await choose("zone", "Berlin");
    await submit();
    expect(saveCourseSettings).toHaveBeenCalledExactlyOnceWith("c-1", {
      timeZone: "Europe/Berlin",
    });
  });

  it("never sends a box a policy holds ticked", async () => {
    await mount({ requiresApproval: false }, { ...OPEN, approval: "locked" });
    expect(checked("Kayıt onayı gereksin")).toBe(true);
    await toggle("Kayıt onayı gereksin");
    expect(button("Kaydet").disabled).toBe(true);
    await toggle("Kapalı ders");
    await submit();
    expect(saveCourseSettings).toHaveBeenCalledExactlyOnceWith("c-1", {
      isClosed: true,
    });
  });
});

describe("the sample session", () => {
  it("unsets the old sample with the page's version, then sets the new one with the version that write returned", async () => {
    await mount();
    await choose("sample", "Hafta 1 · Celse 2");
    await submit();
    expect(setSampleLesson.mock.calls).toEqual([
      ["l-1", { version: 7, isPreview: false }],
      ["l-2", { version: 8, isPreview: true }],
    ]);
    expect(saveCourseSettings).not.toHaveBeenCalled();
    expect(toast("success")).toContain("Ders ayarları kaydedildi");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("writes once to set a sample on a course without one, and once to clear it", async () => {
    await mount({
      weeks: [
        {
          id: "w1",
          weekNumber: 1,
          lessons: [
            { id: "l-1", title: "Celse 1", type: "LIVE", isPreview: false },
          ],
        },
      ],
    });
    await choose("sample", "Hafta 1 · Celse 1");
    await submit();
    expect(setSampleLesson.mock.calls).toEqual([
      ["l-1", { version: 7, isPreview: true }],
    ]);
    await cleanup();

    setSampleLesson.mockClear();
    await mount();
    await choose("sample", "Örnek ders yok");
    await submit();
    expect(setSampleLesson.mock.calls).toEqual([
      ["l-1", { version: 7, isPreview: false }],
    ]);
  });

  it("moves the sample first and then sends the course's fields", async () => {
    await mount();
    await choose("sample", "Hafta 1 · Celse 2");
    await toggle("Kapalı ders");
    await submit();
    expect(setSampleLesson).toHaveBeenCalledTimes(2);
    expect(saveCourseSettings).toHaveBeenCalledExactlyOnceWith("c-1", {
      isClosed: true,
    });
    expect(setSampleLesson.mock.invocationCallOrder[1] as number).toBeLessThan(
      saveCourseSettings.mock.invocationCallOrder[0] as number
    );
  });

  it("says the course has no sample now when the second write fails, sends nothing more and reads the page again", async () => {
    setSampleLesson
      .mockResolvedValueOnce({ success: true, data: { courseVersion: 8 } })
      .mockResolvedValueOnce({ success: false, code: "AUTHZ_FORBIDDEN" });
    await mount();
    await choose("sample", "Hafta 1 · Celse 2");
    await toggle("Kapalı ders");
    await submit();
    expect(toast("error")).toContain("Ayarlar kaydedilemedi");
    expect(toast("error")).toContain(
      "Örnek ders kaydedilemedi; şu an bu dersin örnek dersi yok."
    );
    expect(saveCourseSettings).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("words a stale page from its code when the first write is refused, and keeps the form", async () => {
    setSampleLesson.mockResolvedValueOnce({
      success: false,
      code: "COURSE_VERSION_CONFLICT",
    });
    await mount();
    await choose("sample", "Hafta 1 · Celse 2");
    await submit();
    expect(setSampleLesson).toHaveBeenCalledOnce();
    expect(toast("error")).toContain(
      "Ders, bu sayfayı açtığınızdan beri başkası tarafından kaydedildi."
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(button("Kaydet").disabled).toBe(false);
  });
});

describe("a refused save", () => {
  it("words a policy's lock and a refusal from the code, in a toast that stays, and keeps the form", async () => {
    for (const [code, sentence] of [
      [
        "PLATFORM_POLICY_LOCKED",
        "Bir politika bu değişikliği kilitliyor; ayar değiştirilmedi.",
      ],
      ["AUTHZ_FORBIDDEN", "Bunu yapma izniniz yok."],
    ] as const) {
      saveCourseSettings.mockResolvedValueOnce({ success: false, code });
      await mount();
      await toggle("Kayıt onayı gereksin");
      await submit();
      expect(toast("error"), code).toContain("Ayarlar kaydedilemedi");
      expect(toast("error"), code).toContain(sentence);
      expect(checked("Kayıt onayı gereksin"), code).toBe(false);
      expect(button("Kaydet").disabled, code).toBe(false);
      expect(refresh, code).not.toHaveBeenCalled();
      await cleanup();
    }
  });

  it("reads the page again when the sample moved but the course's fields were refused", async () => {
    saveCourseSettings.mockResolvedValueOnce({
      success: false,
      code: "PLATFORM_POLICY_LOCKED",
    });
    await mount();
    await choose("sample", "Hafta 1 · Celse 2");
    await toggle("Kayıt onayı gereksin");
    await submit();
    expect(toast("error")).toContain("Bir politika bu değişikliği kilitliyor");
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("Yayın", () => {
  const card = (published = true, canPublish = true) =>
    wrap(
      <CoursePublishCard
        courseId="c-1"
        title="Bina ve İzhar Şerhi"
        published={published}
        canPublish={canPublish}
      />
    );
  const question = () =>
    document.querySelector("[role=alertdialog]") as HTMLElement | null;

  it("asks before 'Taslağa çek', with the focus on 'Vazgeç', and sends nothing on 'Vazgeç'", async () => {
    await card();
    expect(document.body.textContent).toContain("Yayında");
    await click(button("Taslağa çek"));
    await settle(60);
    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain("Dersi taslağa çek");
    expect(ask.textContent).toContain(
      "Bina ve İzhar Şerhi taslağa çekilecek; talebeler dersi göremez."
    );
    expect(document.activeElement).toBe(button("Vazgeç", ask));
    await click(button("Vazgeç", ask));
    await settle(60);
    expect(setCourseStatus).not.toHaveBeenCalled();
  });

  it("sends the status alone once the question is answered, says so and reads the page again", async () => {
    await card();
    await click(button("Taslağa çek"));
    await settle(60);
    await click(button("Taslağa çek", question() as HTMLElement));
    await settle(60);
    expect(setCourseStatus).toHaveBeenCalledExactlyOnceWith("c-1", "DRAFT");
    expect(toast("success")).toContain("Ders taslağa çekildi");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("publishes a draft at once", async () => {
    await card(false);
    expect(document.body.textContent).toContain("Taslak");
    await click(button("Yayımla"));
    await settle(60);
    expect(setCourseStatus).toHaveBeenCalledExactlyOnceWith("c-1", "PUBLISHED");
    expect(toast("success")).toContain("Ders yayımlandı");
  });

  it("words a refusal from its code", async () => {
    setCourseStatus.mockResolvedValueOnce({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await card(false);
    await click(button("Yayımla"));
    await settle(60);
    expect(toast("error")).toContain("Yayın durumu değiştirilemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the status alone to a caller who may not publish", async () => {
    await card(true, false);
    expect(document.body.textContent).toContain("Yayında");
    expect(button("Taslağa çek")).toBeUndefined();
    expect(button("Yayımla")).toBeUndefined();
  });
});
