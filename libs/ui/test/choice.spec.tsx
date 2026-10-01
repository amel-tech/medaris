// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "../src/mds/checkbox";
import { ChoiceChips } from "../src/mds/choice-chips";
import { RadioGroup } from "../src/mds/radio-group";
import { Switch } from "../src/mds/switch";
import { cleanup, click, render } from "./render";

afterEach(cleanup);

describe("Checkbox", () => {
  it("is a role=checkbox .mds-check in a .mds-choice label, named by the label text", async () => {
    const onCheckedChange = vi.fn();
    const host = await render(
      <Checkbox
        label="Aydınlatma Metni’ni okudum"
        description="Zorunlu."
        onCheckedChange={onCheckedChange}
      />
    );
    const box = host.querySelector("[role=checkbox]") as HTMLElement;
    expect(box.className).toBe("mds-check");
    expect(host.querySelector("label")?.className).toBe("mds-choice");
    const labelId = box.getAttribute("aria-labelledby") as string;
    expect(host.querySelector(`#${labelId}`)?.textContent).toBe(
      "Aydınlatma Metni’ni okudum"
    );
    const descId = box.getAttribute("aria-describedby") as string;
    expect(host.querySelector(`#${descId}`)?.textContent).toBe("Zorunlu.");
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(box.hasAttribute("data-unchecked")).toBe(true);
    // A user clicks the label (the 24px hit area); the label activates the control.
    await click(host.querySelector(".mds-choice__label") as Element);
    expect(onCheckedChange).toHaveBeenCalledOnce();
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.hasAttribute("data-checked")).toBe(true);
  });

  it("clicking the label text toggles it too", async () => {
    const host = await render(<Checkbox label="Beni hatırla" />);
    await click(host.querySelector(".mds-choice__label") as Element);
    expect(
      host.querySelector("[role=checkbox]")?.getAttribute("aria-checked")
    ).toBe("true");
  });

  it("disabled marks data-disabled and ignores clicks", async () => {
    const host = await render(<Checkbox label="Kapalı" disabled bordered />);
    const box = host.querySelector("[role=checkbox]") as HTMLElement;
    expect(box.hasAttribute("data-disabled")).toBe(true);
    expect(host.querySelector("label")?.className).toBe(
      "mds-choice mds-choice--bordered"
    );
    await click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });
});

describe("Switch", () => {
  it("is a role=switch .mds-switch with no thumb", async () => {
    const host = await render(<Switch label="Bildirimler" defaultChecked />);
    const sw = host.querySelector("[role=switch]") as HTMLElement;
    expect(sw.className).toBe("mds-switch");
    expect(sw.children.length).toBe(0);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    await click(host.querySelector(".mds-choice__label") as Element);
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });
});

describe("RadioGroup", () => {
  const options = [
    { value: "a", label: "Birinci" },
    { value: "b", label: "İkinci", description: "ek" },
  ];

  it("is a labelled radiogroup with nothing selected by default", async () => {
    const host = await render(
      <RadioGroup legend="Kapsam" name="k" options={options} />
    );
    const group = host.querySelector("[role=radiogroup]") as HTMLElement;
    expect(group.className).toBe("mds-choice-group");
    const legendId = group.getAttribute("aria-labelledby") as string;
    expect(host.querySelector(`#${legendId}`)?.textContent).toBe("Kapsam");
    const radios = host.querySelectorAll("[role=radio]");
    expect(radios.length).toBe(2);
    for (const r of radios) {
      expect(r.className).toBe("mds-radio");
      expect(r.getAttribute("aria-checked")).toBe("false");
    }
  });

  it("selecting a radio reports the value and checks only that one", async () => {
    const onChange = vi.fn();
    const host = await render(
      <RadioGroup legend="Kapsam" options={options} onChange={onChange} />
    );
    const radios = host.querySelectorAll("[role=radio]");
    await click(radios[1] as Element);
    expect(onChange).toHaveBeenCalledWith("b");
    expect(radios[0].getAttribute("aria-checked")).toBe("false");
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(radios[1].hasAttribute("data-checked")).toBe(true);
  });
});

describe("ChoiceChips", () => {
  const options = [
    { value: "pzt", label: "Pzt" },
    { value: "sal", label: "Sal" },
    { value: "car", label: "Çar", disabled: true },
  ];

  it("single choice: aria-pressed, exclusive, onChange gets one value", async () => {
    const onChange = vi.fn();
    const host = await render(
      <ChoiceChips legend="Gün" options={options} onChange={onChange} />
    );
    const group = host.querySelector(".mds-chips") as HTMLElement;
    expect(group.getAttribute("role")).toBe("group");
    const chips = host.querySelectorAll("button.mds-chip");
    expect(chips.length).toBe(3);
    await click(chips[0]);
    expect(onChange).toHaveBeenLastCalledWith("pzt");
    await click(chips[1]);
    expect(onChange).toHaveBeenLastCalledWith("sal");
    expect(chips[0].getAttribute("aria-pressed")).toBe("false");
    expect(chips[1].getAttribute("aria-pressed")).toBe("true");
    expect(chips[2].hasAttribute("data-disabled")).toBe(true);
  });

  it("multiple: any number, and the legend is visually hidden unless asked", async () => {
    const onChange = vi.fn();
    const host = await render(
      <ChoiceChips
        legend="Gün"
        multiple
        options={options}
        onChange={onChange}
      />
    );
    expect(host.querySelector(".mds-visually-hidden")?.textContent).toBe("Gün");
    const chips = host.querySelectorAll("button.mds-chip");
    await click(chips[0]);
    await click(chips[1]);
    expect(onChange).toHaveBeenLastCalledWith(["pzt", "sal"]);
    expect(chips[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("name submits the chosen values as hidden inputs", async () => {
    const host = await render(
      <ChoiceChips
        legend="Gün"
        legendVisible
        multiple
        name="days"
        options={options}
        defaultValue={["sal"]}
      />
    );
    expect(host.querySelector(".mds-label")?.textContent).toBe("Gün");
    const read = () =>
      Array.from(
        host.querySelectorAll<HTMLInputElement>("input[type=hidden]"),
        (i) => `${i.name}=${i.value}`
      );
    expect(read()).toEqual(["days=sal"]);
    await click(host.querySelectorAll("button.mds-chip")[0]);
    expect(read()).toEqual(expect.arrayContaining(["days=pzt", "days=sal"]));
    expect(read().length).toBe(2);
  });
});
