// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCreateForm } from "~/features/courses/components/course-create-form";
import { MuderrisDialog } from "~/features/courses/components/muderris-dialog";
import { NazimPicker } from "~/features/kosks/components/nazim-picker";
import type { PickedUser } from "~/features/madrasahs/present";
import { cleanup, click, key, render, settle, type } from "./dom";

/**
 * What a person does while a call of "Ders aç" or of a picker is on its way.
 * A hoca or nazım taken off the list during a search stays off when the
 * search finds someone else; "Dersi aç" waits for a hoca search that is still
 * running, and so does Kaydet of "Hocaları düzenle"; and while "Dersi aç"
 * makes the course, its celses and the answer to the request, the form is
 * held, the breadcrumb is no way out and the page says the course is being
 * opened. The server actions are stubs, held open by hand where the order
 * matters.
 */

const actions = vi.hoisted(() => ({
  createKoskCourse: vi.fn(),
  createCourseSessions: vi.fn(),
  previewCourseSessions: vi.fn(),
  lookupUserByEmail: vi.fn(),
  acceptCourseRequest: vi.fn(),
  readCourse: vi.fn(),
  setCourseMuderris: vi.fn(),
}));
vi.mock("~/features/kosks/actions/courses", () => ({
  createKoskCourse: actions.createKoskCourse,
  createCourseSessions: actions.createCourseSessions,
  previewCourseSessions: actions.previewCourseSessions,
}));
vi.mock("~/features/madrasahs/actions", () => ({
  lookupUserByEmail: actions.lookupUserByEmail,
}));
vi.mock("~/features/courses/actions", () => ({
  readCourse: actions.readCourse,
  setCourseMuderris: actions.setCourseMuderris,
}));
vi.mock("~/features/platform-admin/actions", () => ({
  acceptCourseRequest: actions.acceptCourseRequest,
}));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const kosk = {
  id: "k1",
  name: "Nûruosmaniye Köşkü",
  alwaysRequireApproval: false,
  recordingsNeverPublic: false,
} as unknown as KoskResponse;

const PEOPLE: Record<string, { id: string; name: string; email: string }> = {
  "ahmet@example.com": {
    id: "u-ahmet",
    name: "Ahmet Mehmet",
    email: "ahmet@example.com",
  },
  "bekir@example.com": {
    id: "u-bekir",
    name: "Bekir Sami",
    email: "bekir@example.com",
  },
  "cemal@example.com": {
    id: "u-cemal",
    name: "Cemal Nur",
    email: "cemal@example.com",
  },
};
const found = (email: string) => ({
  kind: "found",
  user: PEOPLE[email] as (typeof PEOPLE)[string],
});

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

const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const submitButton = () => button("Dersi aç");
/** Off as the browser sees it: natively disabled, or Base UI's data-disabled or aria-disabled. */
const off = (el: Element) =>
  (el as HTMLButtonElement).disabled === true ||
  el.hasAttribute("data-disabled") ||
  el.getAttribute("aria-disabled") === "true";
const sendForm = async () => {
  const form = document.querySelector(
    '[data-testid="course-create"]'
  ) as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  });
  await settle(40);
};

/** The form filled in apart from its hocas. */
const fillCourse = async () => {
  await type(field("title"), "Avâmil");
  await type(field("startDate"), "2026-11-02");
  await click(button("Pzt"));
};
const WEEKDAY_CHIPS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const search = async (name: string, email: string) => {
  const input = field(name);
  await type(input, email);
  await key(input, "Enter");
};

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.lookupUserByEmail.mockImplementation(async (email: string) =>
    found(email)
  );
  actions.createKoskCourse.mockResolvedValue({
    success: true,
    data: { id: "c-new" },
  });
  actions.createCourseSessions.mockResolvedValue({ success: true, data: {} });
  actions.acceptCourseRequest.mockResolvedValue({ success: true, data: null });
});
afterEach(cleanup);

describe("a hoca taken off while a search runs (courses/open, editHocalar)", () => {
  it("stays off when the search then finds another hoca", async () => {
    await render(wrap(<CourseCreateForm kosk={kosk} />));
    await search("createImamEmail", "ahmet@example.com");
    await settle();
    expect(byLabel("Hocayı listeden çıkar: Ahmet Mehmet")).not.toBeNull();

    const lookup = deferred<unknown>();
    actions.lookupUserByEmail.mockReturnValueOnce(lookup.promise);
    await search("createImamEmail", "bekir@example.com");
    await click(byLabel("Hocayı listeden çıkar: Ahmet Mehmet") as HTMLElement);
    lookup.settle(found("bekir@example.com"));
    await settle();

    expect(byLabel("Hocayı listeden çıkar: Bekir Sami")).not.toBeNull();
    expect(byLabel("Hocayı listeden çıkar: Ahmet Mehmet")).toBeNull();
  });
});

describe("a nazım taken off while a search runs (kosks/open, kosks/nazims)", () => {
  const Harness = () => {
    const [people, setPeople] = useState<PickedUser[]>([]);
    return (
      <>
        <NazimPicker value={people} onChange={setPeople} />
        <output data-testid="chosen">
          {people.map((p) => p.name).join(", ")}
        </output>
      </>
    );
  };

  it("stays off when the search then finds another nazım", async () => {
    await render(wrap(<Harness />));
    await search("nazimEmail", "ahmet@example.com");
    await settle();
    const lookup = deferred<unknown>();
    actions.lookupUserByEmail.mockReturnValueOnce(lookup.promise);
    await search("nazimEmail", "bekir@example.com");
    await click(byLabel("Seçimi kaldır: Ahmet Mehmet") as HTMLElement);
    lookup.settle(found("bekir@example.com"));
    await settle();

    expect(document.querySelector('[data-testid="chosen"]')?.textContent).toBe(
      "Bekir Sami"
    );
  });
});

describe("Dersi aç while a hoca search runs (courses/open)", () => {
  it("is off and sends nothing until the search is back, then opens the course with that hoca", async () => {
    await render(wrap(<CourseCreateForm kosk={kosk} />));
    await fillCourse();
    await search("createImamEmail", "ahmet@example.com");
    await settle();

    const lookup = deferred<unknown>();
    actions.lookupUserByEmail.mockReturnValueOnce(lookup.promise);
    await search("createImamEmail", "bekir@example.com");
    expect(submitButton().disabled).toBe(true);
    await sendForm();
    expect(actions.createKoskCourse).not.toHaveBeenCalled();

    lookup.settle(found("bekir@example.com"));
    await settle();
    expect(submitButton().disabled).toBe(false);
    await click(byLabel("Ahmet Mehmet dersin imamı olsun") as HTMLElement);
    await click(submitButton());
    await settle(40);

    expect(actions.createKoskCourse).toHaveBeenCalledOnce();
    const [, body] = actions.createKoskCourse.mock.calls[0] as [
      string,
      { muderris: { userId: string }[] },
    ];
    expect(body.muderris.map((m) => m.userId)).toEqual(["u-ahmet", "u-bekir"]);
  });
});

describe("the way out while Dersi aç makes the course (courses/open)", () => {
  const crumb = () =>
    [...document.querySelectorAll(".mds-breadcrumb__item")].find((li) =>
      li.textContent?.includes("Dersler")
    ) as HTMLElement;

  it("is no link while the three calls run, and the page says the course is being opened", async () => {
    const created = deferred<unknown>();
    actions.createKoskCourse.mockReturnValueOnce(created.promise);
    await render(
      wrap(
        <CourseCreateForm
          kosk={kosk}
          request={{ id: "r1", title: "Usûl-i Fıkıh Okumaları" }}
        />
      )
    );
    expect(crumb().querySelector("a")?.getAttribute("href")).toBe(
      "/kosks/k1/dersler"
    );
    await type(field("startDate"), "2026-11-02");
    await click(button("Pzt"));
    await search("createImamEmail", "ahmet@example.com");
    await settle();
    await click(submitButton());
    await settle();

    expect(crumb().querySelector("a")).toBeNull();
    expect(
      document.querySelector('[data-testid="course-opening"]')?.textContent
    ).toBe(resources.tr.nizam.CourseCreate.opening);

    created.settle({ success: true, data: { id: "c-new" } });
    await settle(40);
    expect(actions.acceptCourseRequest).toHaveBeenCalledWith("r1", "c-new");
    expect(actions.createCourseSessions).toHaveBeenCalledOnce();
  });
});

describe("Kaydet of Hocaları düzenle while a hoca search runs (courses/editHocalar)", () => {
  it("is off and sends nothing until the search is back, then saves the list with that hoca", async () => {
    actions.readCourse.mockResolvedValue({
      success: true,
      data: {
        id: "c1",
        version: 4,
        muderris: [
          { id: "m1", userId: "u-ahmet", name: "Ahmet Mehmet", isImam: true },
          { id: "m2", userId: "u-cemal", name: "Cemal Nur", isImam: false },
        ],
      } as unknown as CourseDetailResponse,
    });
    actions.setCourseMuderris.mockResolvedValue({ success: true, data: {} });
    await render(
      wrap(
        <MuderrisDialog
          open
          onOpenChange={() => {}}
          koskId="k1"
          courseId="c1"
          courseTitle="Emsile"
        />
      )
    );
    await settle(50);
    await click(byLabel("Hocayı listeden çıkar: Cemal Nur") as HTMLElement);
    const save = button("Kaydet");
    expect(save.disabled).toBe(false);

    const lookup = deferred<unknown>();
    actions.lookupUserByEmail.mockReturnValueOnce(lookup.promise);
    await search("dialogImamEmail", "bekir@example.com");
    expect(save.disabled).toBe(true);
    await act(async () => {
      (save.closest("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    await settle(40);
    expect(actions.setCourseMuderris).not.toHaveBeenCalled();

    lookup.settle(found("bekir@example.com"));
    await settle();
    expect(save.disabled).toBe(false);
    await click(save);
    await settle(40);

    expect(actions.setCourseMuderris).toHaveBeenCalledOnce();
    const [, , body] = actions.setCourseMuderris.mock.calls[0] as [
      string,
      string,
      { muderris: { userId: string }[] },
    ];
    expect(body.muderris.map((m) => m.userId)).toEqual(["u-ahmet", "u-bekir"]);
  });
});

describe("the Ders aç form while Dersi aç makes the course (courses/open)", () => {
  it("holds the cover, the days, the time zone and the visibility until the calls are over", async () => {
    const created = deferred<unknown>();
    actions.createKoskCourse.mockReturnValueOnce(created.promise);
    await render(wrap(<CourseCreateForm kosk={kosk} />));
    await fillCourse();
    await search("createImamEmail", "ahmet@example.com");
    await settle();
    const form = document.querySelector(
      '[data-testid="course-create"]'
    ) as HTMLElement;
    const held = () => [
      ...form.querySelectorAll('[role="radio"]'),
      ...form.querySelectorAll('[role="combobox"]'),
      ...WEEKDAY_CHIPS.map((name) => button(name)),
    ];
    // the four cover colours and the two visibilities, the caption, the hoca's unvan and the zone, the seven days
    expect(held()).toHaveLength(6 + 3 + 7);
    expect(held().filter(off)).toHaveLength(0);

    await click(submitButton());
    await settle();
    expect(held().filter((el) => !off(el))).toHaveLength(0);

    created.settle({ success: false, errorBody: { code: "X" } });
    await settle(40);
    expect(held().filter(off)).toHaveLength(0);
  });
});
