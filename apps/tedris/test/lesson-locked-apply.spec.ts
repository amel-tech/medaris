// @vitest-environment happy-dom
import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render } from "./dom";

const enroll = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/courses/actions", () => ({ enrollInCourse: enroll }));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(cleanup);

const course = {
  id: "c1",
  koskId: "k1",
  title: "Bina ve İzhar Şerhi",
  timeZone: "Europe/Istanbul",
  contentLocked: true,
  enrollment: null,
  muderris: [],
  weeks: [],
} as unknown as CourseDetailResponse;

const session = {
  id: "l1",
  courseId: "c1",
  weekId: "w1",
  weekNumber: 1,
  weekTitle: "Hafta 1",
  title: "Mastar kalıpları",
  startsAt: new Date("2026-10-04T18:00:00Z"),
  durationMinutes: 60,
  status: "SCHEDULED",
  cancelledAt: null,
  muderris: [],
  contentLocked: true,
} as unknown as SessionResponse;

const mount = async (koskName: string | null = null) => {
  const { LessonLocked } = await import(
    "~/features/courses/components/lesson-locked"
  );
  return render(
    createElement(LessonLocked, {
      course,
      session,
      koskName,
      reason: "apply",
      signInHref: "/signin",
      now: Date.parse("2026-10-01T09:00:00Z"),
    })
  );
};

const apply = (host: HTMLElement) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Kayıt başvurusu yap"
  ) as Element;

describe("tedris/19: Kayıt başvurusu yap -> tedris/07", () => {
  it("opens the window of an application that waits for approval", async () => {
    enroll.mockResolvedValue({ success: true, data: { status: "PENDING" } });
    const host = await mount();
    await click(apply(host));
    expect(document.body.textContent).toContain("Başvurun alındı");
    expect(refresh).toHaveBeenCalled();
  });

  it("opens no window when the talebe is in at once", async () => {
    enroll.mockResolvedValue({ success: true, data: { status: "ENROLLED" } });
    const host = await mount();
    await click(apply(host));
    expect(document.body.textContent).not.toContain("Başvurun alındı");
  });

  it("while the application is sent, the page's ways out are no links: leaving would not stop it", async () => {
    let answer: (value: unknown) => void = () => {};
    enroll.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const host = await mount("Örnek Köşk");
    const hrefs = () =>
      [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    // The breadcrumb's köşk and course, and the course's card.
    expect(hrefs().filter((h) => h === "/kosks/k1")).toHaveLength(1);
    expect(hrefs().filter((h) => h === "/courses/c1")).toHaveLength(2);

    await click(apply(host));
    expect(enroll).toHaveBeenCalledWith("c1");
    expect(hrefs()).not.toContain("/kosks/k1");
    expect(hrefs()).not.toContain("/courses/c1");
    expect(host.textContent).toContain("Örnek Köşk");
    expect(host.textContent).toContain("Bina ve İzhar Şerhi");

    await act(async () =>
      answer({ success: true, data: { status: "PENDING" } })
    );
    expect(hrefs().filter((h) => h === "/courses/c1")).toHaveLength(2);
    expect(document.body.textContent).toContain("Başvurun alındı");
  });
});
