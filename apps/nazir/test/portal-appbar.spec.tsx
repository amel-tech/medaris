// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalAppBar } from "~/features/shell/components/portal-menu";
import { ScopePicker } from "~/features/shell/components/scope-picker";
import { UserRow } from "~/features/shell/components/user-row";
import { labelNav, navFor } from "~/features/shell/nav";
import { cleanup, click, render, settle } from "./dom";
import { translatorFor } from "./server-render";

let pathname = "/medrese/m-1";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(cleanup);

const nav = translatorFor("nazir.Nav");
const shell = translatorFor("nazir.Shell");
const sections = (kind: "medrese" | "ders") =>
  labelNav(
    navFor(
      { kind, id: kind === "medrese" ? "m-1" : "c-1" },
      {
        panoHref: "/medrese/m-1",
        counts: {
          unread: 3,
          coursesWithApplications: 2,
          missingLinks: 1,
          applications: 2,
        },
      }
    ),
    { nav, shell }
  );

const medrese = {
  key: "medrese:m-1",
  kind: "medrese" as const,
  id: "m-1",
  href: "/medrese/m-1",
  name: "Süleymaniye Medresesi",
  summary: ["Medrese başmüderrisi"],
  detail: ["Medrese başmüderrisi"],
};
const bina = {
  key: "ders:c-1",
  kind: "ders" as const,
  id: "c-1",
  href: "/ders/c-1",
  name: "Bina ve İzhar Şerhi",
  summary: ["Müderris", "dersin imamı"],
  detail: ["Müderris", "dersin imamı", "Nûruosmaniye Köşkü"],
};

const mount = (
  kind: "medrese" | "ders",
  bell: string | null = "Bildirimler, 3 okunmamış"
) =>
  render(
    <PortalAppBar
      sections={sections(kind)}
      scope={
        <ScopePicker
          current={kind === "medrese" ? medrese : bina}
          options={[medrese, bina]}
          labels={{
            change: "Kapsam değiştir",
            menu: "Kapsamlar",
            medrese: "Medrese",
            courses: "Dersler",
            note: "Yalnız görev aldığınız medrese ve dersler listelenir.",
          }}
        />
      }
      footer={
        <UserRow
          person={{ name: "Mehmet Emin Işıkoğlu", email: "m@example.com" }}
          roles={["Medrese başmüderrisi", "Müderris"]}
          href="/hesap"
          hint="ayarlar"
        />
      }
      bellLabel={bell ?? undefined}
      outside={[{ path: "/hesap", title: "Hesap ve ayarlar" }]}
      appName="Nazır"
      labels={{ menu: "Menü", nav: "Ana menü", close: "Kapat" }}
    />
  );

const openSheet = async (kind: "medrese" | "ders" = "medrese") => {
  await mount(kind);
  await click(document.querySelector("button.mds-appbar__menu") as Element);
  await settle(50);
  return document.querySelector(".mds-sheet") as HTMLElement;
};

describe("the phone bar (nazir 21, 22)", () => {
  it("is the menu button, the mark, the page's name and the bell", async () => {
    pathname = "/medrese/m-1/dersler";
    await mount("medrese");
    const bar = document.querySelector("header.mds-appbar") as HTMLElement;
    expect(bar.querySelector(".mds-appbar__title")?.textContent).toBe(
      "Dersler"
    );
    expect(
      bar.querySelector("button.mds-appbar__menu")?.getAttribute("aria-label")
    ).toBe("Menü");
    const bell = bar.querySelector("a[href='/bildirimler']");
    expect(bell?.getAttribute("aria-label")).toBe("Bildirimler, 3 okunmamış");
    expect(bell?.textContent).toBe("");
  });

  it("draws no bell where there is no notification page to go to", async () => {
    await mount("medrese", null);
    expect(
      document.querySelector("header.mds-appbar a[href='/bildirimler']")
    ).toBeNull();
  });

  it("opens a sheet named 'Ana menü' with the head, the scope picker, the nav and the person, in that order", async () => {
    const sheet = await openSheet();
    expect(sheet.getAttribute("aria-label")).toBe("Ana menü");
    const body = sheet.querySelector(".mds-sheet__body") as HTMLElement;
    const children = [...body.children].map((child) => {
      if (child.classList.contains("mds-sheet__head")) return "head";
      if (
        child.querySelector("button[aria-haspopup=menu]") ||
        child.matches("button[aria-haspopup=menu]")
      )
        return "scope";
      if (child.tagName === "NAV") return "nav";
      if (child.classList.contains("mds-sheet__foot")) return "foot";
      return child.tagName;
    });
    expect(children).toEqual(["head", "scope", "nav", "foot"]);
  });

  it("starts with the focus in the head, on the close button", async () => {
    const sheet = await openSheet();
    expect(document.activeElement).toBe(
      sheet.querySelector(".mds-sheet__close")
    );
  });

  it("holds the medrese's menu with its badges, and no sign-out", async () => {
    pathname = "/medrese/m-1";
    const sheet = await openSheet();
    const items = [...sheet.querySelectorAll("nav a.mds-nav-item")].map((a) =>
      a.textContent?.replace(/\d.*$/, "").trim()
    );
    expect(items).toEqual([
      "Pano",
      "Bildirimler",
      "Dersler",
      "Talebeler",
      "Medrese nazırları",
      "Yasaklamalar",
      "İtirazlar",
      "Arşiv",
      "Kabul kuralları",
      "Medrese ayarları",
    ]);
    const dersler = sheet.querySelector("nav a[href='/medrese/m-1/dersler']");
    expect(
      dersler?.querySelector(".mds-nav-item__count")?.textContent
    ).toContain("2");
    expect(sheet.textContent).not.toContain("Çıkış yap");
    expect(
      sheet.querySelector("a[aria-current=page]")?.getAttribute("href")
    ).toBe("/medrese/m-1");
  });

  it("holds the course's menu when the scope is a course", async () => {
    pathname = "/ders/c-1/celseler";
    const sheet = await openSheet("ders");
    const items = [...sheet.querySelectorAll("nav a.mds-nav-item")].map((a) =>
      a.textContent?.replace(/\d.*$/, "").trim()
    );
    expect(items).toEqual([
      "Pano",
      "Bildirimler",
      "Genel bakış",
      "Müfredat",
      "Celseler",
      "Talebeler",
      "Sorular",
      "Ders kayıtları",
      "Ders destesi",
      "Yasaklamalar",
      "Arşiv",
      "Ders nazırları",
      "Ders ayarları",
    ]);
    expect(sheet.querySelector("a[aria-current=page]")?.textContent).toContain(
      "Celseler"
    );
  });

  it("ends in the person, a link to the account page", async () => {
    const sheet = await openSheet();
    const person = sheet.querySelector(".mds-sheet__foot a.mds-nav-user");
    expect(person?.getAttribute("href")).toBe("/hesap");
    expect(person?.textContent).toContain("Mehmet Emin Işıkoğlu");
  });

  it("closes when a menu link is followed", async () => {
    await openSheet();
    await click(
      document.querySelector(
        ".mds-sheet nav a[href='/medrese/m-1/dersler']"
      ) as Element
    );
    await settle(60);
    expect(document.querySelector(".mds-sheet")).toBeNull();
  });

  it("is titled with the account page's name outside the menu", async () => {
    pathname = "/hesap";
    await mount("medrese");
    expect(document.querySelector(".mds-appbar__title")?.textContent).toBe(
      "Hesap ve ayarlar"
    );
  });
});
