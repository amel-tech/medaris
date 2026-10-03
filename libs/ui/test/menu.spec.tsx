// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Icon } from "../src/mds/icon";
import { Menu } from "../src/mds/menu";
import { cleanup, click, render, settle } from "./render";

afterEach(cleanup);

describe("Menu", () => {
  it("is a named icon-only ghost button that opens a menu", async () => {
    await render(
      <Menu
        label="Diğer işlemler: Bina ve İzhar Şerhi"
        icon={<Icon name="more" />}
        items={[{ value: "read", label: "Okundu say", onSelect: () => {} }]}
      />
    );
    const trigger = document.querySelector(
      "button.mds-icon-btn"
    ) as HTMLElement;
    expect(trigger.getAttribute("aria-label")).toBe(
      "Diğer işlemler: Bina ve İzhar Şerhi"
    );
    expect(trigger.className).toContain("mds-btn--mini");
    expect(trigger.className).toContain("mds-btn--ghost");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(document.querySelector("[role=menu]")).toBeNull();
  });

  it("with `text` is a small text button named by its text, glyph first", async () => {
    await render(
      <Menu
        label="Takvime ekle"
        text="Takvime ekle"
        size="small"
        icon={<Icon name="calendar" size="sm" />}
        items={[{ value: "ics", label: "Apple Takvim", onSelect: () => {} }]}
      />
    );
    const trigger = document.querySelector("button.mds-btn") as HTMLElement;
    expect(trigger.className).not.toContain("mds-icon-btn");
    expect(trigger.className).toContain("mds-btn--small");
    expect(trigger.hasAttribute("aria-label")).toBe(false);
    expect(trigger.textContent).toBe("Takvime ekle");
    expect(trigger.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("lists .mds-option menu items and reports the chosen one", async () => {
    const onSelect = vi.fn();
    await render(
      <Menu
        label="Diğer işlemler"
        icon={<Icon name="more" />}
        items={[
          { value: "read", label: "Okundu say", onSelect },
          { value: "x", label: "Kapalı", disabled: true, onSelect: vi.fn() },
        ]}
      />
    );
    await click(document.querySelector("button.mds-icon-btn") as HTMLElement);
    await settle(50);
    const popup = document.querySelector("[role=menu]") as HTMLElement;
    expect(popup.className).toContain("mds-popup");
    const rows = document.querySelectorAll("[role=menuitem]");
    expect(rows.length).toBe(2);
    expect(rows[0].className).toContain("mds-option");
    expect(rows[1].hasAttribute("data-disabled")).toBe(true);
    await click(rows[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("draws a rule above a divided row, a glyph before a row's label and a note at the foot", async () => {
    await render(
      <Menu
        label="Takvime ekle"
        text="Takvime ekle"
        icon={<Icon name="calendar" size="sm" />}
        note="Toplantı bağlantısı takvime yazılmaz."
        items={[
          {
            value: "google",
            label: "Google Takvim",
            icon: <Icon name="calendar" size="sm" />,
            onSelect: () => {},
          },
          {
            value: "all",
            label: "Tüm derslerime abone ol",
            icon: <Icon name="repeat" size="sm" />,
            divided: true,
            onSelect: () => {},
          },
        ]}
      />
    );
    await click(document.querySelector("button.mds-btn") as HTMLElement);
    await settle(50);
    const popup = document.querySelector("[role=menu]") as HTMLElement;
    const kids = Array.from(popup.children).map(
      (c) => c.getAttribute("role") ?? c.tagName.toLowerCase()
    );
    expect(kids).toEqual(["menuitem", "separator", "menuitem", "p"]);
    expect(popup.querySelector("[role=menuitem] svg")).not.toBeNull();
    expect(popup.querySelector(".mds-popup__note")?.textContent).toBe(
      "Toplantı bağlantısı takvime yazılmaz."
    );
    expect(popup.querySelectorAll("[role=menuitem]").length).toBe(2);
  });
});
