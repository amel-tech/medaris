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
});
