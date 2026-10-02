// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  type ScopeOption,
  ScopePicker,
} from "~/features/shell/components/scope-picker";
import { cleanup, click, key, render, settle } from "./dom";

afterEach(cleanup);

const medrese: ScopeOption = {
  key: "medrese:m-1",
  kind: "medrese",
  id: "m-1",
  href: "/medrese/m-1",
  name: "Süleymaniye Medresesi",
  summary: ["Medrese başmüderrisi"],
  detail: ["Medrese başmüderrisi"],
};
const bina: ScopeOption = {
  key: "ders:c-1",
  kind: "ders",
  id: "c-1",
  href: "/ders/c-1",
  name: "Bina ve İzhar Şerhi",
  summary: ["Müderris", "dersin imamı"],
  detail: ["Müderris", "dersin imamı", "Nûruosmaniye Köşkü"],
};
const mantik: ScopeOption = {
  key: "ders:c-2",
  kind: "ders",
  id: "c-2",
  href: "/ders/c-2",
  name: "İsâgûcî ile mantığa giriş",
  summary: ["Müderris"],
  detail: ["Müderris", "Fatih Köşkü"],
};
const labels = {
  change: "Kapsam değiştir: Süleymaniye Medresesi",
  menu: "Kapsamlar",
  medrese: "Medrese",
  courses: "Dersler",
  note: "Yalnız görev aldığınız medrese ve dersler listelenir.",
};

const open = async (options = [medrese, bina, mantik], current = medrese) => {
  await render(
    <ScopePicker current={current} options={options} labels={labels} />
  );
  const trigger = document.querySelector("button[aria-haspopup=menu]");
  await click(trigger as Element);
  await settle();
  return trigger as HTMLElement;
};

describe("the open scope picker (nazir 03)", () => {
  it("is a menu named 'Kapsamlar' with a MEDRESE group and a DERSLER group", async () => {
    await open();
    const menu = document.querySelector("[role=menu]");
    expect(menu?.getAttribute("aria-label")).toBe("Kapsamlar");
    expect(menu?.className).toContain("mds-popup");
    const groups = [...document.querySelectorAll("[role=group]")];
    expect(groups.map((g) => g.firstElementChild?.textContent)).toEqual([
      "Medrese",
      "Dersler",
    ]);
  });

  it("lists every scope as a link to its page, and nothing else", async () => {
    await open();
    const rows = [...document.querySelectorAll("a[role=menuitem]")];
    expect(rows.map((r) => r.getAttribute("href"))).toEqual([
      "/medrese/m-1",
      "/ders/c-1",
      "/ders/c-2",
    ]);
    expect(rows.every((r) => r.className.includes("mds-option"))).toBe(true);
    expect(document.querySelectorAll("[role=menuitem]")).toHaveLength(3);
  });

  it("says in each row what the role is, and names a course's köşk", async () => {
    await open();
    const rows = [...document.querySelectorAll("a[role=menuitem]")].map((r) =>
      r.textContent?.replace(/\s+/g, " ").trim()
    );
    expect(rows[0]).toBe("SMSüleymaniye MedresesiMedrese başmüderrisi");
    expect(rows[1]).toContain("Bina ve İzhar Şerhi");
    // the dots between the parts are their own spans (`joinRun`)
    expect(rows[1]).toContain("Müderris·dersin imamı·Nûruosmaniye Köşkü");
    expect(rows[2]).toContain("Müderris·Fatih Köşkü");
  });

  it("marks the current scope, and only it", async () => {
    await open();
    const rows = [...document.querySelectorAll("a[role=menuitem]")];
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([
      "true",
      null,
      null,
    ]);
    const checks = document.querySelectorAll("a[role=menuitem] .mds-icon");
    expect(checks).toHaveLength(1);
  });

  it("ends with the note that only the person's scopes are listed", async () => {
    await open();
    expect(
      document.querySelector("[role=menu]")?.lastElementChild?.textContent
    ).toBe("Yalnız görev aldığınız medrese ve dersler listelenir.");
  });

  it("marks the current course when the person is in a course", async () => {
    await open([medrese, bina, mantik], bina);
    const current = document.querySelector(
      "a[role=menuitem][aria-current=true]"
    );
    expect(current?.getAttribute("href")).toBe("/ders/c-1");
  });

  it("lists a lone group without the other group's heading", async () => {
    await open([bina, mantik], bina);
    expect(document.querySelectorAll("[role=group]")).toHaveLength(1);
    expect(document.querySelector("[role=menu]")?.textContent).toContain(
      "Dersler"
    );
    expect(document.querySelector("[role=menu]")?.textContent).not.toContain(
      "Medrese başmüderrisi"
    );
  });

  it("closes on Escape and gives the focus back to the picker", async () => {
    const trigger = await open();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await key(document.querySelector("[role=menu]") as Element, "Escape");
    await settle(60);
    expect(document.querySelector("[role=menu]")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens above the phone sheet (z 61): the list's positioner sits at z 70", async () => {
    await open();
    const positioner = document.querySelector("[role=menu]")?.parentElement;
    expect(positioner?.className).toContain("z-70");
  });
});

describe("the closed scope picker", () => {
  it("is named for the scope it changes from and shows its role", async () => {
    await render(
      <ScopePicker
        current={bina}
        options={[medrese, bina]}
        labels={{ ...labels, change: "Kapsam değiştir: Bina ve İzhar Şerhi" }}
      />
    );
    const trigger = document.querySelector("button[aria-haspopup=menu]");
    expect(trigger?.getAttribute("aria-label")).toBe(
      "Kapsam değiştir: Bina ve İzhar Şerhi"
    );
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.textContent).toContain("Müderris·dersin imamı");
    expect(trigger?.textContent).not.toContain("Nûruosmaniye");
    expect(document.querySelector("[role=menu]")).toBeNull();
  });

  it("is not openable with one scope", async () => {
    await render(
      <ScopePicker current={medrese} options={[medrese]} labels={labels} />
    );
    expect(document.querySelector("button")).toBeNull();
    expect(document.body.textContent).toContain("Süleymaniye Medresesi");
  });
});
