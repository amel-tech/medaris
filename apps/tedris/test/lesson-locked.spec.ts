import { resources } from "@medaris/i18n";
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
    useTranslations: (namespace: string) => (key: string) =>
      [...namespace.split("."), ...key.split(".")].reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources[locale.current as keyof typeof resources]
      ),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("~/features/courses/actions", () => ({ enrollInCourse: vi.fn() }));

const COURSE_ID = "c0000000-0000-4000-8000-000000000001";
const LESSON_ID = "c0000000-0000-4000-8000-000000000002";

const render = async (reason: LessonLockReason, languageTag = "tr") => {
  locale.current = languageTag;
  const { LessonLocked } = await import(
    "~/features/courses/components/lesson-locked"
  );
  return renderToStaticMarkup(
    createElement(LessonLocked, {
      courseId: COURSE_ID,
      courseTitle: "Bina ve İzhar Şerhi",
      lessonId: LESSON_ID,
      lessonTitle: "Canlı halka",
      reason,
    })
  );
};

describe("B8: which call to action a locked lesson offers (MDRS-103)", () => {
  const enrollment = (status: "PENDING" | "ENROLLED") => ({ status }) as never;

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
});

describe("B8 renders (MDRS-103)", () => {
  const tr = resources.tr.tedris.LessonLocked;

  it("shows sign in, linking back to the lesson", async () => {
    const html = await render("signIn");
    expect(html).toContain(tr.title);
    expect(html).toContain(`>${tr.signIn}</a>`);
    expect(html).toContain(
      `callbackUrl=${encodeURIComponent(`/courses/${COURSE_ID}/lessons/${LESSON_ID}`)}`
    );
  });

  it("shows apply", async () => {
    const html = await render("apply");
    expect(html).toContain(tr.description.apply);
    expect(html).toContain(`>${tr.apply}</button>`);
  });

  it("shows the pending state as a disabled control", async () => {
    const html = await render("pending");
    expect(html).toContain(tr.description.pending);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Başvurun onay bekliyor/);
  });

  it.each(["en", "ar"] as const)("is translated in %s", async (languageTag) => {
    const html = await render("apply", languageTag);
    expect(html).toContain(resources[languageTag].tedris.LessonLocked.title);
  });
});
