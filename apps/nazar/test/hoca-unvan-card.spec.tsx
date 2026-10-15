// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HocaUnvanCard } from "~/features/course-settings/components/hoca-unvan-card";
import {
  type HocaRow,
  hocaRowsOf,
  NO_UNVAN,
  unvanChanges,
  unvanErrorKey,
  unvanOptions,
} from "~/features/course-settings/hoca-unvan";
import { cleanup, click, render, settle } from "./dom";
import { translatorFor } from "./server-render";

/**
 * "Hocalar ve unvanları" of Ders ayarları (owner, 2026-10-15): each hoca of
 * the course with a select of unvans, the name the course will show under it,
 * and one `PUT /courses/:id/muderris/:userId/unvan` per changed hoca on
 * Kaydet. The action is a stub.
 */
const refresh = vi.fn();
const setHocaUnvan = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/course-settings/actions", () => ({
  setHocaUnvan: (...args: unknown[]) => setHocaUnvan(...args),
}));

const AHMET = "a7000000-0000-4000-8000-000000000004";
const BEKIR = "a7000000-0000-4000-8000-000000000005";

const HOCAS: HocaRow[] = hocaRowsOf([
  { userId: AHMET, name: "Ahmet Mehmet", unvan: "PROF_DR" },
  { userId: BEKIR, name: "Bekir Sami", unvan: null },
  // typed in before accounts were required: a name, no account
  { name: "Ahmed Hilmi" },
]);

const mount = (editable = true, hocas: HocaRow[] = HOCAS) =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <HocaUnvanCard
          courseId="c-1"
          courseTitle="Emsile"
          hocas={hocas}
          editable={editable}
        />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );

const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined;
const triggers = () =>
  [...document.querySelectorAll("button.mds-input")] as HTMLButtonElement[];
const shut = (trigger: HTMLButtonElement) =>
  trigger.disabled || trigger.hasAttribute("data-disabled");
const fields = () => [...document.querySelectorAll(".mds-field")];
/** The options of the list that is open now; a closed list may stay in the page. */
const openOptions = () => [
  ...document.querySelectorAll(".mds-popup[data-open] .mds-option"),
];
const choose = async (index: number, label: string) => {
  await click(triggers()[index] as HTMLElement);
  await settle(50);
  const option = openOptions().find((o) => o.textContent?.trim() === label);
  expect(option, label).toBeDefined();
  await click(option as Element);
  await settle(50);
};
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const submit = async () => {
  await click(button("Kaydet") as HTMLButtonElement);
  await settle(40);
};

beforeEach(() => {
  refresh.mockReset();
  setHocaUnvan.mockReset();
  setHocaUnvan.mockImplementation(
    async (_course: string, _user: string, unvan: string | null) => ({
      success: true,
      data: { unvan },
    })
  );
});
afterEach(cleanup);

describe("Hocalar ve unvanları", () => {
  it("lists each hoca with a labelled select holding their unvan and the name the course shows", async () => {
    await mount();
    expect(document.querySelector("h2")?.textContent).toBe(
      "Hocalar ve unvanları"
    );
    const [ahmet, bekir, hilmi] = fields();
    expect(ahmet.querySelector("label")?.textContent).toBe(
      "Ahmet Mehmet için unvan"
    );
    expect(triggers()[0].textContent).toBe("Prof. Dr.");
    expect(ahmet.textContent).toContain(
      "Derste “Prof. Dr. Ahmet Mehmet” olarak görünür."
    );
    expect(triggers()[1].textContent).toBe("Hoca (unvansız)");
    expect(bekir.textContent).toContain(
      "Derste “Bekir Sami Hoca” olarak görünür."
    );
    // the label and the line under it are the select's name and description
    const label = ahmet.querySelector("label") as HTMLLabelElement;
    const trigger = triggers()[0];
    expect(
      label.htmlFor === trigger.id ||
        trigger.getAttribute("aria-labelledby")?.includes(label.id)
    ).toBe(true);
    expect(trigger.getAttribute("aria-describedby")).toBeTruthy();
    // a hoca with no account keeps a shut select and says why
    expect(shut(triggers()[2])).toBe(true);
    expect(hilmi.textContent).toContain("hesabı olmadığı için");
    expect(shut(triggers()[0])).toBe(false);
    expect(button("Kaydet")?.disabled).toBe(true);
  });

  it("offers the untitled Hoca first, then every unvan as it is written before the name", async () => {
    await mount();
    await click(triggers()[1]);
    await settle(50);
    expect(openOptions().map((o) => o.textContent?.trim())).toEqual([
      "Hoca (unvansız)",
      "Prof. Dr.",
      "Doç. Dr.",
      "Dr.",
      "Müderris",
      "Molla",
      "Müftü",
      "Şeyh",
      "Hafız",
    ]);
  });

  it("shows the new name at once, and Kaydet sends one write per changed hoca", async () => {
    await mount();
    await choose(1, "Molla");
    expect(fields()[1].textContent).toContain(
      "Derste “Molla Bekir Sami” olarak görünür."
    );
    await choose(0, "Hoca (unvansız)");
    expect(fields()[0].textContent).toContain(
      "Derste “Ahmet Mehmet Hoca” olarak görünür."
    );
    expect(button("Kaydet")?.disabled).toBe(false);
    await submit();
    expect(setHocaUnvan.mock.calls).toEqual([
      ["c-1", AHMET, null],
      ["c-1", BEKIR, "MOLLA"],
    ]);
    expect(toast("success")).toContain("Unvanlar kaydedildi");
    expect(refresh).toHaveBeenCalledOnce();
    expect(button("Kaydet")?.disabled).toBe(true);
  });

  it("puts the stored unvans back on Vazgeç and sends nothing", async () => {
    await mount();
    await choose(0, "Şeyh");
    await click(button("Vazgeç") as HTMLButtonElement);
    await settle(20);
    expect(triggers()[0].textContent).toBe("Prof. Dr.");
    expect(button("Kaydet")?.disabled).toBe(true);
    expect(setHocaUnvan).not.toHaveBeenCalled();
  });

  it("stops at a refusal, words it from the code and reads the page again", async () => {
    setHocaUnvan.mockResolvedValueOnce({
      success: false,
      code: "COURSE_MUDERRIS_NOT_FOUND",
    });
    await mount();
    await choose(0, "Dr.");
    await choose(1, "Hafız");
    await submit();
    expect(setHocaUnvan).toHaveBeenCalledOnce();
    expect(toast("error")).toContain("Unvan kaydedilemedi");
    expect(toast("error")).toContain("Bu kişi artık dersin hocası değil");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("only shows the unvans to someone without course.settings", async () => {
    await mount(false);
    expect(triggers().every(shut)).toBe(true);
    expect(button("Kaydet")).toBeUndefined();
    expect(document.body.textContent).toContain(
      "Unvanları değiştirme izniniz yok; yalnız görebilirsiniz."
    );
    expect(fields()[0].textContent).toContain("Prof. Dr. Ahmet Mehmet");
  });
});

describe("the rules", () => {
  it("reads the stored unvan, and an unknown one as none", () => {
    expect(
      hocaRowsOf([
        { userId: AHMET, name: "Ahmet", unvan: "MUFTU" },
        { userId: BEKIR, name: "Bekir", unvan: "SULTAN" as never },
      ]).map((r) => r.unvan)
    ).toEqual(["MUFTU", NO_UNVAN]);
  });

  it("sends only the hocas whose unvan changed, never a row with no account", () => {
    const draft = HOCAS.map((row) => ({ ...row, unvan: "SEYH" }));
    expect(unvanChanges(HOCAS, HOCAS)).toEqual([]);
    expect(unvanChanges(HOCAS, draft)).toEqual([
      { userId: AHMET, unvan: "SEYH" },
      { userId: BEKIR, unvan: "SEYH" },
    ]);
  });

  it("starts the options with the untitled one", () => {
    expect(unvanOptions("Hoca (unvansız)")[0]).toEqual({
      value: NO_UNVAN,
      label: "Hoca (unvansız)",
    });
  });

  it("words every refusal with a sentence the catalogue has", () => {
    for (const code of [
      "AUTHZ_FORBIDDEN",
      "COURSE_MUDERRIS_NOT_FOUND",
      "VALIDATION_ERROR",
      "SOMETHING_NEW",
    ]) {
      expect(translatorFor("nazar").has(unvanErrorKey(code)), code).toBe(true);
    }
  });
});
