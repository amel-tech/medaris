// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCreateForm } from "~/features/courses/components/course-create-form";
import { MuderrisDialog } from "~/features/courses/components/muderris-dialog";
import {
  NO_UNVAN,
  setMemberUnvan,
  type TeamState,
  unvanOptions,
  withUnvans,
} from "~/features/courses/present";
import { cleanup, click, key, render, settle, type } from "./dom";

/**
 * "Ders aç" gives each hoca the unvan they carry in the new course (owner,
 * 2026-10-15): a select beside each chosen person, "Hoca (unvansız)" first,
 * and the code in that person's entry of `POST /kosks/:koskId/courses`. On a
 * course that exists the unvan is set in Ders ayarları, so "Müderrisleri
 * düzenle" draws no select. The actions are stubs.
 */
const actions = vi.hoisted(() => ({
  createKoskCourse: vi.fn(),
  createCourseSessions: vi.fn(),
  previewCourseSessions: vi.fn(),
  lookupUserByEmail: vi.fn(),
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
  acceptCourseRequest: vi.fn(),
}));
vi.mock("~/features/kosks/actions", () => ({ updateKosk: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({ toast }));
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
/** The options of the list that is open now; a closed list may stay in the page. */
const openOptions = () => [
  ...document.querySelectorAll(".mds-popup[data-open] .mds-option"),
];
const choose = async (trigger: HTMLElement, label: string) => {
  await click(trigger);
  await settle(50);
  const option = openOptions().find((o) => o.textContent?.trim() === label);
  expect(option, label).toBeDefined();
  await click(option as Element);
  await settle(50);
};
const pick = async (email: string) => {
  const input = field("createImamEmail");
  await type(input, email);
  await key(input, "Enter");
  await settle(20);
};

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.lookupUserByEmail.mockImplementation(async (email: string) => {
    const person = PEOPLE[email];
    return person
      ? { kind: "found", user: person }
      : { kind: "none", email: email };
  });
  actions.createKoskCourse.mockResolvedValue({
    success: true,
    data: { id: "c-new" },
  });
  actions.createCourseSessions.mockResolvedValue({
    success: true,
    data: {},
  });
});
afterEach(cleanup);

describe("Ders aç: an unvan for each hoca (2026-10-15)", () => {
  it("draws a labelled select beside each chosen hoca, 'Hoca (unvansız)' first", async () => {
    await render(wrap(<CourseCreateForm kosk={kosk} />));
    expect(byLabel("Ahmet Mehmet için unvan")).toBeNull();
    await pick("ahmet@example.com");
    await pick("bekir@example.com");
    const ahmet = byLabel("Ahmet Mehmet için unvan") as HTMLElement;
    expect(ahmet).not.toBeNull();
    expect(byLabel("Bekir Sami için unvan")).not.toBeNull();
    expect(ahmet.textContent).toBe("Hoca (unvansız)");
    await click(ahmet);
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

  it("sends the chosen unvan in that hoca's entry, none for an untitled one, nothing for one taken off", async () => {
    await render(wrap(<CourseCreateForm kosk={kosk} />));
    await type(field("title"), "Avâmil");
    await type(field("startDate"), "2026-11-02");
    await click(button("Pzt"));
    await pick("ahmet@example.com");
    await pick("bekir@example.com");
    await pick("cemal@example.com");
    await choose(
      byLabel("Ahmet Mehmet için unvan") as HTMLElement,
      "Prof. Dr."
    );
    await choose(byLabel("Cemal Nur için unvan") as HTMLElement, "Molla");
    // Cemal is taken off again: his unvan goes with him.
    await click(byLabel("Cemal Nur müderrisini listeden çıkar") as HTMLElement);
    await click(byLabel("Ahmet Mehmet dersin imamı olsun") as HTMLElement);
    await click(button("Dersi aç"));
    await settle(40);

    expect(actions.createKoskCourse).toHaveBeenCalledOnce();
    const [koskId, body] = actions.createKoskCourse.mock.calls[0] as [
      string,
      { muderris: { userId: string; unvan?: string }[] },
    ];
    expect(koskId).toBe("k1");
    expect(body.muderris).toEqual([
      expect.objectContaining({ userId: "u-ahmet", unvan: "PROF_DR" }),
      expect.not.objectContaining({ unvan: expect.anything() }),
    ]);
    expect(body.muderris[1]?.userId).toBe("u-bekir");
    expect(body.muderris.map((m) => m.userId)).not.toContain("u-cemal");
  });

  it("draws no unvan select in 'Müderrisleri düzenle' on a course that exists", async () => {
    actions.readCourse.mockResolvedValue({
      success: true,
      data: {
        id: "c1",
        version: 4,
        muderris: [
          {
            id: "m1",
            userId: "u-ahmet",
            name: "Ahmet Mehmet",
            unvan: "PROF_DR",
            isImam: true,
          },
          {
            id: "m2",
            userId: "u-bekir",
            name: "Bekir Sami",
            unvan: null,
            isImam: false,
          },
        ],
      } as unknown as CourseDetailResponse,
    });
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
    expect(document.body.textContent).toContain("Ahmet Mehmet");
    expect(byLabel("Ahmet Mehmet için unvan")).toBeNull();
    expect(document.querySelectorAll("button.mds-input")).toHaveLength(0);
  });
});

describe("the unvan rules of the list", () => {
  const team: TeamState = {
    members: [
      { userId: "u-ahmet", name: "Ahmet Mehmet" },
      { userId: "u-bekir", name: "Bekir Sami" },
    ],
    imamUserId: "u-ahmet",
  };

  it("sets a code, and 'Hoca (unvansız)' or an unknown value takes it off", () => {
    const set = setMemberUnvan(team, "U-AHMET", "SEYH");
    expect(set.members[0]?.unvan).toBe("SEYH");
    expect(set.members[1]).toEqual(team.members[1]);
    expect(setMemberUnvan(set, "u-ahmet", NO_UNVAN).members[0]).toEqual(
      team.members[0]
    );
    expect(setMemberUnvan(set, "u-ahmet", "SULTAN").members[0]).toEqual(
      team.members[0]
    );
  });

  it("adds each listed member's code to their entry and nothing else", () => {
    const set = setMemberUnvan(team, "u-bekir", "HAFIZ");
    expect(
      withUnvans(
        [
          { userId: "u-ahmet", name: "Ahmet Mehmet" },
          { userId: "u-bekir", name: "Bekir Sami" },
        ],
        set
      )
    ).toEqual([
      { userId: "u-ahmet", name: "Ahmet Mehmet" },
      { userId: "u-bekir", name: "Bekir Sami", unvan: "HAFIZ" },
    ]);
  });

  it("starts the options with the untitled one", () => {
    expect(unvanOptions("Hoca (unvansız)")[0]).toEqual({
      value: NO_UNVAN,
      label: "Hoca (unvansız)",
    });
    expect(unvanOptions("x")).toHaveLength(9);
  });
});
