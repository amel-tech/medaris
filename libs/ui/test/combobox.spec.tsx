// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MultiCombobox } from "../src/mds/combobox";
import { cleanup, click, render, settle } from "./render";

afterEach(cleanup);

const options = [
  { value: "t1", label: "1. İcma" },
  { value: "t3", label: "3. Kıyas" },
  { value: "t7", label: "7. Kur'an ilimleri" },
];

function Harness({ start = [] as string[] }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <label htmlFor="topics">Konular</label>
      <MultiCombobox
        id="topics"
        options={options}
        value={value}
        onChange={setValue}
        placeholder="Konu arayın"
        emptyText="Bu adla bir konu yok."
        removeLabel={(name) => `Çıkar: ${name}`}
      />
      <output data-value="">{value.join(",")}</output>
    </>
  );
}

/** Types into the combobox's field the way React hears it. */
async function typeInto(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  await act(async () => {
    input.focus();
    setter?.call(input, text);
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      })
    );
  });
  await settle(60);
}

/** Escape in the field, as the browser sends it. */
async function pressEscape(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await settle(30);
}

const input = () =>
  document.querySelector("input[role=combobox]") as HTMLInputElement;
const optionsShown = () =>
  [...document.querySelectorAll("[role=option]")].map((o) => o.textContent);
const chosen = () =>
  document.querySelector("output[data-value]")?.textContent ?? "";

describe("MultiCombobox", () => {
  it("is a labelled combobox in the .mds-input box, its list closed", async () => {
    await render(<Harness />);
    const field = input();
    expect(field.id).toBe("topics");
    expect(field.getAttribute("placeholder")).toBe("Konu arayın");
    expect(field.closest(".mds-input.mds-combobox")).not.toBeNull();
    expect(document.querySelector("[role=listbox]")).toBeNull();
  });

  it("filters the list by what is typed and takes several values", async () => {
    await render(<Harness />);
    await typeInto(input(), "kıy");
    expect(optionsShown()).toEqual(["3. Kıyas"]);
    await click(document.querySelector("[role=option]") as Element);
    await settle(30);
    expect(chosen()).toBe("t3");
    await typeInto(input(), "icma");
    await click(document.querySelector("[role=option]") as Element);
    await settle(30);
    expect(chosen()).toBe("t3,t1");
    // Chosen, a value stands as a chip before the field.
    expect(
      [...document.querySelectorAll(".mds-combobox__chip")].map(
        (c) => c.textContent
      )
    ).toEqual(["3. Kıyas", "1. İcma"]);
    expect(input().hasAttribute("placeholder")).toBe(false);
  });

  it("says so when nothing matches", async () => {
    await render(<Harness />);
    await typeInto(input(), "zzz");
    expect(optionsShown()).toEqual([]);
    expect(document.body.textContent).toContain("Bu adla bir konu yok.");
  });

  it("drops a value with its chip's named remove button", async () => {
    await render(<Harness start={["t3", "t7"]} />);
    const remove = document.querySelector(
      '[aria-label="Çıkar: 3. Kıyas"]'
    ) as HTMLElement;
    expect(remove).not.toBeNull();
    await click(remove);
    await settle(30);
    expect(chosen()).toBe("t7");
  });

  it("closes the list on Escape and keeps every chosen value, open or shut (MDRS-248)", async () => {
    await render(<Harness start={["t3", "t7"]} />);
    // Open: the first Escape closes the list.
    await typeInto(input(), "icma");
    expect(document.querySelector("[role=listbox]")).not.toBeNull();
    await pressEscape(input());
    expect(chosen()).toBe("t3,t7");
    // Shut: Base UI would clear every chip here; it must not.
    await pressEscape(input());
    await pressEscape(input());
    expect(chosen()).toBe("t3,t7");
    expect(
      [...document.querySelectorAll(".mds-combobox__chip")].map(
        (c) => c.textContent
      )
    ).toEqual(["3. Kıyas", "7. Kur'an ilimleri"]);
  });
});
