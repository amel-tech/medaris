// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTimeField } from "../src/mds/date-time-field";
import { Field } from "../src/mds/field";
import { cleanup, click, render, settle } from "./render";

afterEach(cleanup);

const boxes = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>("input.mds-input"));

async function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  await act(async () => {
    input.focus();
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function blur(input: HTMLInputElement) {
  await act(async () => {
    input.blur();
  });
}

describe("DateTimeField", () => {
  it("splits the value into a date and a time and posts it joined", async () => {
    await render(
      <form>
        <DateTimeField
          locale="tr-TR"
          name="end"
          defaultValue="2026-10-05T21:00"
        />
      </form>
    );
    const [date, time] = boxes();
    expect(date?.value).toBe("05.10.2026");
    expect(time?.value).toBe("21:00");
    const hidden = document.querySelectorAll('input[type="hidden"]');
    expect(hidden).toHaveLength(1);
    expect((hidden[0] as HTMLInputElement).name).toBe("end");
    expect((hidden[0] as HTMLInputElement).value).toBe("2026-10-05T21:00");
  });

  it("round-trips edits to either half, and reports a half-filled value as empty and bad", async () => {
    const onChange = vi.fn();
    const onBad = vi.fn();
    function Harness() {
      const [value, setValue] = useState("2026-10-05T21:00");
      return (
        <>
          <DateTimeField
            locale="tr-TR"
            value={value}
            onChange={(v) => {
              setValue(v);
              onChange(v);
            }}
            onBadInputChange={onBad}
          />
          <output>{value}</output>
        </>
      );
    }
    await render(<Harness />);
    const [date, time] = boxes() as [HTMLInputElement, HTMLInputElement];
    await type(time, "22:30");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-05T22:30");
    await type(date, "6.10.2026");
    await blur(date);
    expect(onChange).toHaveBeenLastCalledWith("2026-10-06T22:30");
    expect(document.querySelector("output")?.textContent).toBe(
      "2026-10-06T22:30"
    );
    await type(time, "");
    await blur(time);
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(onBad).toHaveBeenLastCalledWith(true);
    // the date half survives the empty value
    expect(boxes()[0]?.value).toBe("06.10.2026");
    await type(time, "08:00");
    expect(onChange).toHaveBeenLastCalledWith("2026-10-06T08:00");
    expect(onBad).toHaveBeenLastCalledWith(false);
  });

  it("follows a new value from outside", async () => {
    function Harness() {
      const [value, setValue] = useState("2026-10-05T21:00");
      return (
        <>
          <DateTimeField locale="tr-TR" value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue("2027-01-02T07:45")}>
            set
          </button>
        </>
      );
    }
    await render(<Harness />);
    await click(
      document.querySelector(
        "button[type=button]:not([aria-label])"
      ) as HTMLElement
    );
    expect(boxes().map((b) => b.value)).toEqual(["02.01.2027", "07:45"]);
  });

  it("names the time box after the field's label, and turns it invalid with the field", async () => {
    await render(
      <Field label="Bitiş" error="Bitiş başlangıçtan sonra olmalı.">
        <DateTimeField locale="tr-TR" defaultValue="2026-10-05T21:00" />
      </Field>
    );
    await settle(10);
    const [date, time] = boxes() as [HTMLInputElement, HTMLInputElement];
    const label = document.querySelector("label.mds-label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(date.id);
    const named = (time.getAttribute("aria-labelledby") ?? "").split(" ");
    expect(named[0]).toBe(label.id);
    expect(document.getElementById(named[1] ?? "")?.textContent).toBe("Saat");
    const error = document.querySelector(".mds-error") as HTMLElement;
    expect(time.getAttribute("aria-describedby")).toContain(error.id);
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(time.getAttribute("aria-invalid")).toBe("true");
  });

  it("bounds the time by min only on min's own day", async () => {
    await render(
      <DateTimeField
        locale="tr-TR"
        min="2026-10-05T09:00"
        defaultValue="2026-10-05T08:00"
      />
    );
    const [, time] = boxes() as [HTMLInputElement, HTMLInputElement];
    expect(time.getAttribute("aria-invalid")).toBe("true");
    await cleanup();
    await render(
      <DateTimeField
        locale="tr-TR"
        min="2026-10-05T09:00"
        defaultValue="2026-10-06T08:00"
      />
    );
    expect(boxes()[1]?.hasAttribute("aria-invalid")).toBe(false);
  });
});
