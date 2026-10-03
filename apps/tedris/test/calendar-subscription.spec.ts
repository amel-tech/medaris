// @vitest-environment happy-dom
import { createElement, Fragment, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * "Takvim aboneliği" (MDRS-163, design tedris/23): the three states of the
 * link (none, one that exists and cannot be shown again, one just issued), the
 * confirmation before renewing, and the copy buttons.
 */

const mocks = vi.hoisted(() => ({
  regenerate: vi.fn(),
}));
vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  const text = (namespace: string, key: string) =>
    [...namespace.split("."), ...key.split(".")].reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr
    ) as string;
  return {
    useLocale: () => "tr",
    useFormatter: () => ({
      dateTime: (d: Date) => `T:${d.toISOString().slice(0, 10)}`,
    }),
    useTranslations: (namespace: string) =>
      Object.assign(
        (key: string, values: Record<string, unknown> = {}) =>
          Object.entries(values).reduce(
            (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
            text(namespace, key)
          ),
        {
          rich: (key: string, values: Record<string, unknown>) => {
            const m = /^(.*)<code>(.*)<\/code>(.*)$/.exec(text(namespace, key));
            if (!m) return text(namespace, key);
            return createElement(
              Fragment,
              null,
              m[1],
              (values.code as (c: ReactNode) => ReactNode)(m[2]),
              m[3]
            );
          },
        }
      ),
  };
});
vi.mock("~/features/courses/actions", () => ({
  regenerateMyCalendarFeed: mocks.regenerate,
}));
// The page imports the action through a relative path.
vi.mock("../actions", () => ({ regenerateMyCalendarFeed: mocks.regenerate }));

const LINK = {
  url: "https://tedris.example/calendar/abc.ics",
  webcalUrl: "webcal://tedris.example/calendar/abc.ics",
  createdAt: "2026-10-01T07:42:00.000Z",
};

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
});

const mount = async (status: { createdAt: string | null } | null) => {
  const { CalendarSubscription } = await import(
    "~/features/courses/components/calendar-subscription"
  );
  await render(createElement(CalendarSubscription, { status }));
  const button = (label: string) =>
    [...document.querySelectorAll("button, a")].find((b) =>
      b.textContent?.includes(label)
    ) as HTMLElement | undefined;
  const input = (id: string) =>
    document.getElementById(id) as HTMLInputElement | null;
  return { button, input };
};

describe("Takvim aboneliği (design tedris/23)", () => {
  it("with no link yet, offers to create one and shows no fields", async () => {
    const { button, input } = await mount({ createdAt: null });
    expect(button("Bağlantı oluştur")).toBeDefined();
    expect(input("calendar-google")).toBeNull();
    expect(document.body.textContent).toContain(
      "Henüz bir takvim bağlantın yok."
    );
  });

  it("shows the explanations: how to add, what is in it, and that the link is the person's own", async () => {
    await mount({ createdAt: null });
    const body = document.body.textContent as string;
    expect(body).toContain("Takvimine nasıl eklenir");
    expect(body).toContain("calendar.google.com");
    expect(document.querySelector("code")?.textContent).toBe(
      "calendar.google.com"
    );
    expect(body).toContain("Bu takvimde neler var");
    expect(body).toContain("30 gün öncesinden 180 gün sonrasına");
    expect(body).toContain("Bağlantın sana özel");
    expect(body).toContain("Google değişiklikleri geç gösterebilir");
  });

  it("creates the first link without asking, then shows it with the 'copy it now' warning", async () => {
    mocks.regenerate.mockResolvedValue({ success: true, data: LINK });
    const { button, input } = await mount({ createdAt: null });
    await click(button("Bağlantı oluştur") as HTMLElement);
    await settle();
    expect(mocks.regenerate).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Bağlantını şimdi kopyala");
    expect(input("calendar-google")?.value).toBe(LINK.url);
    expect(input("calendar-apple")?.value).toBe(LINK.webcalUrl);
    expect(input("calendar-google")?.getAttribute("dir")).toBe("ltr");
    expect(input("calendar-google")?.readOnly).toBe(true);
    expect(
      (button("Apple Takvim’de aç") as HTMLAnchorElement).getAttribute("href")
    ).toBe(LINK.webcalUrl);
    expect(document.body.textContent).toContain("Oluşturuldu: T:2026-10-01");
  });

  it("with a link that already exists, shows the fields masked and cannot copy them", async () => {
    const { button, input } = await mount({ createdAt: LINK.createdAt });
    expect(input("calendar-google")?.value).toMatch(/^•+$/);
    expect(input("calendar-google")?.value).not.toContain("http");
    expect(document.body.textContent).not.toContain("Bağlantını şimdi kopyala");
    const copy = button("Kopyala") as HTMLButtonElement;
    expect(copy.getAttribute("aria-disabled") ?? String(copy.disabled)).toMatch(
      /true/
    );
    expect(button("Bağlantıyı yenile")).toBeDefined();
  });

  it("asks before renewing, and renews only on 'Yenile'", async () => {
    mocks.regenerate.mockResolvedValue({ success: true, data: LINK });
    const { button } = await mount({ createdAt: LINK.createdAt });
    await click(button("Bağlantıyı yenile") as HTMLElement);
    await settle();
    expect(mocks.regenerate).not.toHaveBeenCalled();
    const dialog = document.querySelector("[role=alertdialog]") as HTMLElement;
    expect(dialog.textContent).toContain("Bağlantı yenilensin mi?");
    expect(dialog.textContent).toContain("eskisi çalışmayı bırakır");
    await click(
      [...dialog.querySelectorAll("button")].find(
        (b) => b.textContent === "Vazgeç"
      ) as HTMLElement
    );
    await settle();
    expect(mocks.regenerate).not.toHaveBeenCalled();

    await click(button("Bağlantıyı yenile") as HTMLElement);
    await settle();
    const again = document.querySelector("[role=alertdialog]") as HTMLElement;
    await click(
      [...again.querySelectorAll("button")].find(
        (b) => b.textContent === "Yenile"
      ) as HTMLElement
    );
    await settle();
    expect(mocks.regenerate).toHaveBeenCalledTimes(1);
  });

  it("says so when the link could not be created", async () => {
    mocks.regenerate.mockResolvedValue({ success: false, error: "x" });
    const { button, input } = await mount({ createdAt: null });
    await click(button("Bağlantı oluştur") as HTMLElement);
    await settle();
    expect(document.body.textContent).toContain("Bağlantı oluşturulamadı.");
    expect(input("calendar-google")).toBeNull();
  });

  it("asks before creating when it could not read whether a link exists", async () => {
    const { button } = await mount(null);
    expect(document.body.textContent).toContain(
      "Bağlantı durumun şu an okunamadı."
    );
    await click(button("Bağlantıyı yenile") as HTMLElement);
    await settle();
    expect(document.querySelector("[role=alertdialog]")).not.toBeNull();
  });

  it("copies each address to the clipboard", async () => {
    mocks.regenerate.mockResolvedValue({ success: true, data: LINK });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const { button } = await mount({ createdAt: null });
    await click(button("Bağlantı oluştur") as HTMLElement);
    await settle();
    const copies = [...document.querySelectorAll("button")].filter(
      (b) => b.textContent === "Kopyala"
    );
    expect(copies).toHaveLength(2);
    await click(copies[0]);
    await click(copies[1]);
    expect(writeText.mock.calls.map((c) => c[0])).toEqual([
      LINK.url,
      LINK.webcalUrl,
    ]);
    await settle();
    expect(document.body.textContent).toContain("Bağlantı kopyalandı");
  });

  it("leaves the field selected and says so when the clipboard refuses", async () => {
    mocks.regenerate.mockResolvedValue({ success: true, data: LINK });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const { button, input } = await mount({ createdAt: null });
    await click(button("Bağlantı oluştur") as HTMLElement);
    await settle();
    const select = vi.spyOn(
      input("calendar-google") as HTMLInputElement,
      "select"
    );
    await click(
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Kopyala"
      ) as HTMLElement
    );
    await settle();
    expect(select).toHaveBeenCalled();
    expect(document.body.textContent).toContain("Kopyalanamadı.");
  });
});
