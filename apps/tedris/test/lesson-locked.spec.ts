import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  type LessonLockReason,
  lessonLockReason,
} from "~/features/courses/lesson-lock";

// The client hooks B8 uses, resolved without a Next request: translations
// from the real catalogue, a router nobody calls, and no server action.
const locale = vi.hoisted(() => ({ current: "tr" }));
vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => locale.current,
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources[locale.current as keyof typeof resources]
        ) as string;
      return Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          read(key).replace(/\{(\w+)\}/g, (_, name) =>
            String(values?.[name] ?? "")
          ),
        { raw: read, rich: (key: string) => read(key) }
      );
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("~/features/courses/actions", () => ({ enrollInCourse: vi.fn() }));

const COURSE_ID = "c0000000-0000-4000-8000-000000000001";
const LESSON_ID = "c0000000-0000-4000-8000-000000000002";
// 1 Ekim 2026, three days before the session of the design (4 Ekim 21:00).
const NOW = Date.parse("2026-10-01T09:00:00Z");

const course = {
  id: COURSE_ID,
  koskId: "k1",
  title: "Bina ve İzhar Şerhi",
  category: "الصرف",
  timeZone: "Europe/Istanbul",
  contentLocked: true,
  enrollment: null,
  muderris: [
    { id: "m1", name: "Mehmet Emin Işıkoğlu" },
    { id: "m2", name: "Abdülhamit Karaosmanoğlu" },
  ],
  weeks: [
    {
      id: "w4",
      weekNumber: 4,
      title: "Mastar ve müştaklar",
      lessons: [
        {
          id: LESSON_ID,
          weekId: "w4",
          title: "Mastar kalıpları ve ism-i fâil",
          type: "LIVE",
          scheduledAt: new Date("2026-10-04T18:00:00Z"),
          durationMinutes: 60,
          isPreview: false,
          orderIndex: 0,
          cancelledAt: null,
          replacementLessonId: null,
        },
      ],
    },
  ],
} as unknown as CourseDetailResponse;

const session = {
  id: LESSON_ID,
  courseId: COURSE_ID,
  weekId: "w4",
  weekNumber: 4,
  weekTitle: "Mastar ve müştaklar",
  title: "Mastar kalıpları ve ism-i fâil",
  startsAt: new Date("2026-10-04T18:00:00Z"),
  durationMinutes: 60,
  status: "SCHEDULED",
  cancelledAt: null,
  muderris: [],
  contentLocked: true,
} as unknown as SessionResponse;

const render = async (reason: LessonLockReason, languageTag = "tr") => {
  locale.current = languageTag;
  const { LessonLocked } = await import(
    "~/features/courses/components/lesson-locked"
  );
  return renderToStaticMarkup(
    createElement(LessonLocked, {
      course,
      session,
      koskName: "Nûruosmaniye Köşkü",
      reason,
      signInHref: `/tr/auth/signin?callbackUrl=${encodeURIComponent(`/courses/${COURSE_ID}/lessons/${LESSON_ID}`)}`,
      now: NOW,
    })
  );
};

describe("B8: which call to action a locked lesson offers (MDRS-103)", () => {
  const enrollment = (status: "PENDING" | "ENROLLED" | "REVOKED") =>
    ({ status }) as never;

  it("is not locked when the API sent the content", () => {
    expect(lessonLockReason({ contentLocked: false }, true)).toBeNull();
  });

  it("asks a signed-out visitor to sign in", () => {
    expect(lessonLockReason({ contentLocked: true }, false)).toBe("signIn");
  });

  it("offers a signed-in stranger to apply", () => {
    expect(
      lessonLockReason({ contentLocked: true, enrollment: undefined }, true)
    ).toBe("apply");
  });

  it("tells a PENDING caller the application awaits approval", () => {
    expect(
      lessonLockReason(
        { contentLocked: true, enrollment: enrollment("PENDING") },
        true
      )
    ).toBe("pending");
  });

  it("locks a REVOKED caller out with nothing to apply for (tedris/19, criterion 4)", () => {
    expect(
      lessonLockReason(
        { contentLocked: true, enrollment: enrollment("REVOKED") },
        true
      )
    ).toBe("revoked");
  });
});

describe("tedris/19 renders (MDRS-162)", () => {
  const tr = resources.tr.tedris.LessonLocked;

  it("draws the locked session: title, week, countdown, date and the lock text", async () => {
    const html = await render("apply");
    expect(html).toContain("Mastar kalıpları ve ism-i fâil");
    expect(html).toContain("Hafta 4");
    expect(html).toContain("3 gün sonra");
    expect(html).toContain("4 Ekim Pazar 21:00");
    expect(html).toContain(tr.description.apply);
  });

  it("shows the course card and the programme with locked rows", async () => {
    const html = await render("apply");
    expect(html).toContain("Bina ve İzhar Şerhi");
    expect(html).toContain("Mehmet Emin Işıkoğlu ve Abdülhamit Karaosmanoğlu");
    expect(html).toContain("Müfredat");
    expect(html).toContain("is-locked");
  });

  it("names none of the content a locked body does not carry", async () => {
    const html = await render("apply");
    expect(html).not.toContain("zoom.us");
    expect(html).not.toContain("Celseye katıl");
    expect(html).not.toContain("Celse akışı");
  });

  it("shows sign in, linking back to the lesson", async () => {
    const html = await render("signIn");
    expect(html).toContain(tr.description.signIn);
    expect(html).toContain(`>${tr.signIn}</a>`);
    expect(html).toContain(
      `callbackUrl=${encodeURIComponent(`/courses/${COURSE_ID}/lessons/${LESSON_ID}`)}`
    );
  });

  it("shows apply as the one primary button", async () => {
    const html = await render("apply");
    expect(html).toMatch(/<button[^>]*mds-btn--primary[^>]*>/);
    expect(html).toContain(tr.apply);
  });

  it("shows the pending state as a disabled control", async () => {
    const html = await render("pending");
    expect(html).toContain(tr.description.pending);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
    expect(html).toContain(tr.pending);
  });

  it("offers a REVOKED caller no button, only the lock", async () => {
    const html = await render("revoked");
    expect(html).toContain(tr.description.revoked);
    expect(html).not.toContain(tr.apply);
    expect(html).not.toContain(tr.signIn);
  });

  it.each(["en", "ar"] as const)("is translated in %s", async (languageTag) => {
    const html = await render("apply", languageTag);
    expect(html).toContain(
      resources[languageTag].tedris.LessonLocked.description.apply.replace(
        "'",
        "&#x27;"
      )
    );
  });
});
