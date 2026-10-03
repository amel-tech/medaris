// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, key, render, settle } from "./dom";

const locale = vi.hoisted(() => ({ current: "tr" }));
vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => locale.current,
    useTranslations: (namespace: string) => (name: string) =>
      [...namespace.split("."), ...name.split(".")].reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources[locale.current as keyof typeof resources]
      ),
  };
});

afterEach(cleanup);

const open = async (onClose = vi.fn(), courseTitle = "Bina ve İzhar Şerhi") => {
  const { EnrollmentReceivedDialog } = await import(
    "~/features/courses/components/enrollment-received-dialog"
  );
  await render(
    createElement(EnrollmentReceivedDialog, {
      open: true,
      onClose,
      courseTitle,
    })
  );
  await settle();
  return onClose;
};

describe("tedris/07: the application window", () => {
  it("says the application was received and how to take it back", async () => {
    locale.current = "tr";
    await open();
    const dialog = document.body.querySelector(".mds-dialog") as HTMLElement;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.querySelector(".mds-dialog__title")?.textContent).toBe(
      "Başvurun alındı"
    );
    expect(dialog.textContent).toContain(
      "Ders kadrosu başvurunu değerlendirecek."
    );
    expect(dialog.textContent).toContain(
      "Onaylanana kadar başvurunu bu sayfadan geri çekebilirsin."
    );
  });

  it("names the course in Turkish capitals: i becomes İ", async () => {
    locale.current = "tr";
    await open(vi.fn(), "Bina ve İzhar Şerhi");
    expect(document.body.querySelector(".mds-eyebrow")?.textContent).toBe(
      "BİNA VE İZHAR ŞERHİ"
    );
    await cleanup();
    await open(vi.fn(), "kâfiye ile nahiv");
    expect(document.body.querySelector(".mds-eyebrow")?.textContent).toBe(
      "KÂFİYE İLE NAHİV"
    );
  });

  it("opens with focus on 'Tamam' and closes on it", async () => {
    locale.current = "tr";
    const onClose = await open();
    const ok = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Tamam"
    ) as HTMLElement;
    expect(document.activeElement).toBe(ok);
    await click(ok);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Esc", async () => {
    locale.current = "tr";
    const onClose = await open();
    await key(document.activeElement as Element, "Escape");
    await settle();
    expect(onClose).toHaveBeenCalled();
  });

  it("is in the other catalogues too", async () => {
    locale.current = "en";
    await open();
    expect(document.body.querySelector(".mds-dialog__title")?.textContent).toBe(
      "Your application was received"
    );
  });
});
