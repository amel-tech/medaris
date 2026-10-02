// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/** "Takvime ekle" (MDRS-163, design tedris/22): three rows, a note, no meeting link anywhere. */

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("~/lib/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const labels = {
  button: "Takvime ekle",
  google: "Google Takvim",
  apple: "Apple Takvim (.ics)",
  subscribe: "Tüm derslerime abone ol",
  note: "Takvim kaydı bu celse sayfasına bağlanır; toplantı bağlantısı takvime yazılmaz.",
  linkIsOnPage: "Toplantı bağlantısı oturum sayfasındadır:",
};

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const open = async (text = true) => {
  const { CalendarMenu } = await import(
    "~/features/courses/components/calendar-menu"
  );
  await render(
    createElement(CalendarMenu, {
      text,
      courseId: "c1",
      courseTitle: "Emsile ve Bina",
      lesson: {
        id: "l1",
        title: "Mehmûz fiiller",
        startsAt: "2026-10-03T18:00:00.000Z",
        durationMinutes: 60,
      },
      locale: "tr",
      labels,
    })
  );
  await click(document.querySelector("button.mds-btn") as HTMLElement);
  await settle(50);
  return [...document.querySelectorAll("[role=menuitem]")] as HTMLElement[];
};

describe("Takvime ekle (design tedris/22)", () => {
  it("opens three rows and the note, the last row set apart", async () => {
    const rows = await open();
    expect(rows.map((r) => r.textContent)).toEqual([
      "Google Takvim",
      "Apple Takvim (.ics)",
      "Tüm derslerime abone ol",
    ]);
    expect(document.querySelector(".mds-popup__sep")).not.toBeNull();
    expect(document.querySelector(".mds-popup__note")?.textContent).toBe(
      labels.note
    );
  });

  it("Google opens the pre-filled event in a new tab, with the session page and no meeting link", async () => {
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    const [google] = await open();
    await click(google);
    const [href, target, features] = opened.mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(target).toBe("_blank");
    expect(features).toContain("noopener");
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render"
    );
    expect(url.searchParams.get("text")).toBe(
      "Emsile ve Bina — Mehmûz fiiller"
    );
    expect(url.searchParams.get("dates")).toBe(
      "20261003T180000Z/20261003T190000Z"
    );
    expect(url.searchParams.get("details")).toContain("/courses/c1/lessons/l1");
    expect(href).not.toContain("zoom");
  });

  it("the subscription row goes to Hesap's Takvim aboneliği", async () => {
    const rows = await open();
    await click(rows[2]);
    expect(mocks.push).toHaveBeenCalledWith("/account/calendar");
  });

  it("is an icon-only button named for its session when it has no text", async () => {
    const { CalendarMenu } = await import(
      "~/features/courses/components/calendar-menu"
    );
    await render(
      createElement(CalendarMenu, {
        courseId: "c1",
        courseTitle: "Emsile ve Bina",
        lesson: { id: "l1", title: "x", startsAt: "2026-10-03T18:00:00.000Z" },
        locale: "tr",
        labels: { ...labels, button: "Takvime ekle: x" },
      })
    );
    const trigger = document.querySelector(
      "button.mds-icon-btn"
    ) as HTMLElement;
    expect(trigger.getAttribute("aria-label")).toBe("Takvime ekle: x");
  });
});
