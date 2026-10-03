// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "../src/mds/select";
import { Tabs, TabsPanel } from "../src/mds/tabs";
import { Tooltip } from "../src/mds/tooltip";
import { cleanup, click, key, render, settle } from "./render";

afterEach(cleanup);

const tabs = [
  { value: "a", label: "Genel", count: 1234 },
  { value: "b", label: "Talebeler" },
  { value: "c", label: "Ayarlar" },
];

describe("Tabs", () => {
  it("is a named tablist of .mds-tab with aria-selected, panels from TabsPanel", async () => {
    const onChange = vi.fn();
    const host = await render(
      <Tabs
        tabs={tabs}
        value="a"
        label="Ders bölümleri"
        onChange={onChange}
        locale="tr-TR"
      >
        <TabsPanel value="a">A içeriği</TabsPanel>
        <TabsPanel value="b">B içeriği</TabsPanel>
      </Tabs>
    );
    const list = host.querySelector("[role=tablist]") as HTMLElement;
    expect(list.className).toBe("mds-tabs");
    expect(list.getAttribute("aria-label")).toBe("Ders bölümleri");
    const items = host.querySelectorAll("[role=tab]");
    expect(items.length).toBe(3);
    expect(items[0].className).toContain("mds-tab");
    expect(items[0].getAttribute("aria-selected")).toBe("true");
    expect(items[1].getAttribute("aria-selected")).toBe("false");
    expect(items[0].querySelector(".mds-tab__count")?.textContent).toBe(
      "1.234"
    );
    expect(host.querySelector("[role=tabpanel]")?.textContent).toBe(
      "A içeriği"
    );
    await click(items[1]);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("mode=links is a named nav of links with aria-current", async () => {
    const host = await render(
      <Tabs
        mode="links"
        label="Bölümler"
        value="b"
        tabs={tabs.map((t) => ({ ...t, href: `/${t.value}` }))}
      />
    );
    const nav = host.querySelector("nav") as HTMLElement;
    expect(nav.getAttribute("aria-label")).toBe("Bölümler");
    expect(host.querySelector("[role=tab]")).toBeNull();
    const links = host.querySelectorAll("a.mds-tab");
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(links[0].hasAttribute("aria-current")).toBe(false);
  });
});

describe("Select", () => {
  it("shows the placeholder until something is chosen", async () => {
    const host = await render(
      <Select
        aria-label="Kapsam"
        placeholder="Seçin"
        options={[{ value: "a", label: "Birinci" }, "İkinci"]}
      />
    );
    const trigger = host.querySelector("button.mds-input") as HTMLElement;
    expect(trigger.getAttribute("role")).toBe("combobox");
    expect(trigger.hasAttribute("data-placeholder")).toBe(true);
    expect(trigger.textContent).toContain("Seçin");
    expect(host.querySelector(".mds-select")).not.toBeNull();
  });

  it("shows the chosen label for a default value", async () => {
    const host = await render(
      <Select
        aria-label="Kapsam"
        defaultValue="a"
        options={[{ value: "a", label: "Birinci" }]}
      />
    );
    expect(
      (host.querySelector("button.mds-input") as HTMLElement).textContent
    ).toContain("Birinci");
  });

  it("opens a list of .mds-option rows and reports the choice", async () => {
    const onChange = vi.fn();
    await render(
      <Select
        aria-label="Kapsam"
        onChange={onChange}
        options={[
          { value: "a", label: "Birinci" },
          { value: "b", label: "İkinci" },
        ]}
      />
    );
    const trigger = document.querySelector("button.mds-input") as HTMLElement;
    await click(trigger);
    await settle(50);
    const popup = document.querySelector(".mds-popup");
    expect(popup).not.toBeNull();
    // MDRS-170: a list opened inside a dialog sat under its viewport and could
    // not be clicked; the positioner takes the class that lifts it above.
    expect(popup?.closest(".mds-popup-positioner")).not.toBeNull();
    const options = document.querySelectorAll(".mds-option");
    expect(options.length).toBe(2);
    expect(options[0].getAttribute("role")).toBe("option");
    await click(options[1]);
    await settle(50);
    expect(onChange).toHaveBeenCalledWith("b");
    expect(trigger.textContent).toContain("İkinci");
  });
});

describe("Tooltip", () => {
  it("keeps its child as the trigger and shows .mds-tooltip on focus; Esc hides it", async () => {
    const host = await render(
      <Tooltip label="Bildirimler">
        <button type="button">Zil</button>
      </Tooltip>
    );
    const trigger = host.querySelector("button") as HTMLButtonElement;
    expect(document.querySelector(".mds-tooltip")).toBeNull();
    await settle();
    trigger.focus();
    await settle(100);
    const bubble = document.querySelector(".mds-tooltip");
    expect(bubble?.textContent).toBe("Bildirimler");
    await key(trigger, "Escape");
    await settle(100);
    expect(document.querySelector(".mds-tooltip")).toBeNull();
  });
});
