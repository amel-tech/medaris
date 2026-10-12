import type {
  CourseSummaryResponse,
  EnrolledCourseResponse,
  KoskResponse,
  MadrasahExploreResponse,
  ScheduleSessionResponse,
} from "@medaris/services/tedrisat";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseDiscoverQuery } from "~/features/discover/discover-query";
import { scheduleWindow } from "~/features/schedule/schedule-model";
import { inviteHrefs } from "~/lib/invite-hrefs";
import { summary as deckSummary } from "./decks-harness";

/**
 * Every link keeps the language of the page it is on. tedris routes without
 * locale detection, so a path without a locale (`/decks`) lands on Turkish:
 * an English or Arabic reader who followed "Desteler", "Tümünü gör" or a
 * course card fell back to Turkish, then reloaded into their own language if
 * they had chosen it with the switcher. Here the pages are drawn on `/en`
 * with the English catalogue, and every in-app address on them must start
 * with `/en`, the way back after signing in included.
 */

const pathname = vi.hoisted(() => ({ current: "/home" }));

vi.mock("next-intl", async (orig) => {
  const real = await orig<typeof import("next-intl")>();
  const { resources } = await import("@medaris/i18n");
  return {
    ...real,
    useLocale: () => "en",
    useTimeZone: () => "Europe/Istanbul",
    useTranslations: (namespace?: string) =>
      real.createTranslator({
        locale: "en",
        messages: { ...resources.en },
        namespace: namespace as never,
      }),
  };
});
vi.mock("next-intl/server", async () => {
  const real = await vi.importActual<typeof import("next-intl")>("next-intl");
  const { resources } = await import("@medaris/i18n");
  return {
    getLocale: async () => "en",
    getTimeZone: async () => "Europe/Istanbul",
    getTranslations: async (namespace?: string) =>
      real.createTranslator({
        locale: "en",
        messages: { ...resources.en },
        namespace: namespace as never,
      }),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => `/en${pathname.current}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("~/lib/i18n/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn() }),
}));
// The kit's bar drawn open: its sheet is a Base UI Dialog portal, which a
// static render leaves closed.
vi.mock("@medaris/ui/mds/app-bar", () => ({
  AppBar: (props: {
    actions: ReactNode;
    footer: ReactNode;
    children: ReactNode;
  }) =>
    createElement(
      "div",
      null,
      props.actions,
      createElement("nav", null, props.children),
      props.footer
    ),
}));
vi.mock("~/features/courses/components/calendar-menu", () => ({
  CalendarMenu: () => null,
}));
vi.mock("~/features/courses/actions", () => ({
  followKosk: vi.fn(),
  unfollowKosk: vi.fn(),
  leaveCourse: vi.fn(),
}));
const reads = vi.hoisted(() => ({
  courses: vi.fn(),
  decks: vi.fn(),
  followed: vi.fn(),
}));
vi.mock("~/features/home/reads", () => ({
  getHomeCourses: reads.courses,
  getHomeDecks: reads.decks,
  getHomeFollowedCourses: reads.followed,
}));

/** Every in-app address on the page: an href from the root that is not an API route. */
const appHrefs = (html: string) =>
  [...html.matchAll(/href="(\/[^"]*)"/g)]
    .map(([, href]) => href.replaceAll("&amp;", "&"))
    .filter((href) => !href.startsWith("/api/"));

/** The page links somewhere, and every link, and every way back after signing in, stays on /en. */
const expectEnglish = (html: string) => {
  const hrefs = appHrefs(html);
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).toMatch(/^\/en(\/|\?|$)/);
    const back = new URL(href, "http://tedris.test").searchParams.get(
      "callbackUrl"
    );
    if (back !== null) expect(back).toMatch(/^\/en\//);
  }
};

const html = (element: ReactNode) => renderToStaticMarkup(element);

describe("the top bar and the phone menus", () => {
  it("keep a member on /en", async () => {
    const { DesktopBar } = await import("~/components/phone-menu/desktop-bar");
    const { MemberPhoneMenu } = await import(
      "~/components/phone-menu/member-phone-menu"
    );
    pathname.current = "/decks";
    expectEnglish(
      html(createElement(DesktopBar, { signedIn: true, name: "Zeynep" }))
    );
    expectEnglish(html(createElement(MemberPhoneMenu, { name: "Zeynep" })));
  });

  it("keep a visitor on /en, before and after signing in", async () => {
    const { DesktopBar } = await import("~/components/phone-menu/desktop-bar");
    const { PhoneMenu } = await import("~/components/phone-menu/phone-menu");
    pathname.current = "/kosks/k1";
    const bar = html(createElement(DesktopBar, { signedIn: false }));
    expectEnglish(bar);
    expect(bar).toContain(`callbackUrl=${encodeURIComponent("/en/kosks/k1")}`);
    expectEnglish(html(createElement(PhoneMenu)));
  });
});

const NOW = new Date("2026-10-01T07:00:00Z");

const enrolled = (id: string, status: string): EnrolledCourseResponse =>
  ({
    id,
    title: `Course ${id}`,
    category: null,
    koskName: "Nûruosmaniye Köşkü",
    madrasahName: null,
    muderris: [{ id: "m1", name: "Abdülhamit", isImam: true }],
    nextSession: { at: "2026-10-04T18:00:00Z", weekNumber: 4 },
    enrollment: {
      status,
      progress: 40,
      completedAt: status === "COMPLETED" ? "2026-09-26T10:00:00.000Z" : null,
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-26T10:00:00.000Z",
    },
  }) as unknown as EnrolledCourseResponse;

const session = (
  over: Partial<ScheduleSessionResponse> = {}
): ScheduleSessionResponse =>
  ({
    id: "l1",
    courseId: "c1",
    courseTitle: "Emsile ve Bina",
    koskId: "k1",
    koskName: "Nûruosmaniye Köşkü",
    weekNumber: 5,
    title: "Mehmûz fiiller",
    startsAt: new Date("2026-10-03T18:00:00Z"),
    durationMinutes: 60,
    status: "SCHEDULED",
    meetingUrl: null,
    ...over,
  }) as ScheduleSessionResponse;

describe("Ana sayfa", () => {
  it("keeps its sections, their cards and their 'see all' links on /en", async () => {
    reads.courses.mockResolvedValue([enrolled("c1", "ENROLLED")]);
    reads.decks.mockResolvedValue([
      {
        ...deckSummary({ id: "d1" }),
        dueCount: 3,
      },
    ]);
    reads.followed.mockResolvedValue([
      {
        id: "f1",
        title: "Avâmil",
        koskName: "Fatih Köşkü",
        muderrisName: null,
        muderrisIsImam: false,
      },
    ]);
    const sections = await import("~/features/home/components/home-sections");
    expectEnglish(html(await sections.ContinueSection()));
    expectEnglish(html(await sections.DecksSection()));
    expectEnglish(html(await sections.FollowedSection()));
  });

  it("keeps an empty section's way to Keşfet on /en", async () => {
    reads.courses.mockResolvedValue([]);
    const { ContinueSection } = await import(
      "~/features/home/components/home-sections"
    );
    expectEnglish(html(await ContinueSection()));
  });

  it("keeps the next celse and the ones after it on /en", async () => {
    const { HomeSessions } = await import(
      "~/features/schedule/components/home-sessions"
    );
    expectEnglish(
      html(
        await HomeSessions({
          name: "Zeynep",
          sessions: [
            session(),
            session({ id: "l2", startsAt: new Date("2026-10-06T18:00:00Z") }),
          ],
          now: NOW,
        })
      )
    );
  });
});

const kosk = (): KoskResponse =>
  ({
    id: "k1",
    name: "Nûruosmaniye Köşkü",
    handle: "@nuruosmaniye",
    description: "Arapça dil ilimlerinin köşkü.",
    coverHue: 215,
    isPrivate: false,
    field: null,
    level: null,
    tags: [],
    courseCount: 1,
    isFollowing: false,
  }) as unknown as KoskResponse;

const madrasah = (): MadrasahExploreResponse => ({
  id: "m1",
  handle: "suleymaniye",
  name: "Süleymaniye Medresesi",
  headMuderrisName: null,
  courseCount: 1,
  courses: [{ id: "c1", title: "Bina", coverHue: 215 }],
});

const course = (): CourseSummaryResponse =>
  ({
    id: "c1",
    title: "Emsile ve Bina",
    category: null,
    level: "BEGINNER",
    muderris: [],
    enrollment: null,
    madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
    nextSessionAt: null,
  }) as unknown as CourseSummaryResponse;

describe("Keşfet and a köşk", () => {
  it("keep the cards, the pages, the retry and the köşk application on /en", async () => {
    const { DiscoverPage } = await import(
      "~/features/discover/components/discover-page"
    );
    const data = {
      kosks: [kosk()],
      koskTotal: 30,
      madrasahs: [madrasah()],
      allMadrasahs: [madrasah()],
    };
    const query = parseDiscoverQuery({ page: "2", q: "sarf" });
    expectEnglish(
      html(await DiscoverPage({ query, data: data as never, signedIn: true }))
    );
    expectEnglish(
      html(await DiscoverPage({ query, data: data as never, signedIn: false }))
    );
    expectEnglish(
      html(await DiscoverPage({ query, data: null, failed: true }))
    );
  });

  it("keeps a köşk's crumbs, courses, medrese and decks on /en", async () => {
    const { KoskPage, KoskLoadError } = await import(
      "~/features/courses/components/kosk-page"
    );
    expectEnglish(
      html(
        await KoskPage({
          kosk: kosk(),
          courses: [course()],
          decks: {
            accessible: true,
            decks: [
              { id: "d1", title: "Emsile", cardCount: 3, inCollection: false },
            ],
          } as never,
          signedIn: false,
        })
      )
    );
    expectEnglish(html(await KoskLoadError({ koskId: "k1" })));
  });
});

describe("Derslerim and Programım", () => {
  it("keep every course, application and the calendar link on /en", async () => {
    const { MyCoursesPage } = await import(
      "~/features/courses/components/my-courses-page"
    );
    expectEnglish(
      html(
        await MyCoursesPage({
          courses: [
            enrolled("c1", "ENROLLED"),
            enrolled("c2", "PENDING"),
            enrolled("c3", "COMPLETED"),
          ],
        })
      )
    );
    expectEnglish(html(await MyCoursesPage({ courses: [] })));
  });

  it("keeps the week's celses and its paging on /en", async () => {
    const { SchedulePage } = await import(
      "~/features/schedule/components/schedule-page"
    );
    expectEnglish(
      html(
        await SchedulePage({
          sessions: [session()],
          window: scheduleWindow("2026-10-08", NOW, "Europe/Istanbul"),
          now: NOW,
        })
      )
    );
  });
});

describe("Desteler", () => {
  it("keeps the decks, their study links, explore and create on /en", async () => {
    const { DecksPage } = await import(
      "~/features/flashcards/components/decks-page"
    );
    expectEnglish(
      html(
        createElement(DecksPage, {
          decks: [
            deckSummary({ id: "a" }),
            deckSummary({ id: "b", isMine: false, inCollection: true }),
          ],
        })
      )
    );
    expectEnglish(html(createElement(DecksPage, { decks: [] })));
  });

  it("keeps the way back from a deck that cannot be opened on /en", async () => {
    const { DeckUnavailable } = await import(
      "~/features/flashcards/components/deck-unavailable"
    );
    expectEnglish(html(await DeckUnavailable()));
  });
});

describe("the sign-in invitation", () => {
  it("comes back to the page in the visitor's language", () => {
    expect(inviteHrefs("en", "/kosks/k1?x=1")).toEqual({
      signIn: `/en/auth/signin?callbackUrl=${encodeURIComponent("/en/kosks/k1?x=1")}`,
      register: "/en/auth/register",
    });
    expect(
      new URL(
        inviteHrefs("ar", "/discover").signIn,
        "http://t"
      ).searchParams.get("callbackUrl")
    ).toBe("/ar/discover");
  });
});
