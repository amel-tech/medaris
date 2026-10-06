// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field } from "../src/mds/field";
import { TimeField } from "../src/mds/time-field";
import { cleanup, click, render, settle } from "./render";

afterEach(cleanup);

const boxes = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>("input.mds-input")
  ) as HTMLInputElement[];
const box = () => boxes()[0] as HTMLInputElement;
const listButton = () =>
  document.querySelector('[aria-label="Saat seç"]') as HTMLButtonElement;
const options = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
const option = (t: string) =>
  document.querySelector(`[data-time="${t}"]`) as HTMLElement;

async function press(
  el: Element,
  k: string,
  init: KeyboardEventInit = {}
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", {
    key: k,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    el.dispatchEvent(event);
  });
  return event;
}

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

async function caret(input: HTMLInputElement, at: number) {
  await act(async () => {
    input.focus();
    input.setSelectionRange(at, at);
  });
}

function ControlledTime(props: {
  initial?: string;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <TimeField
      locale="tr-TR"
      name="startTime"
      value={value}
      onChange={(v) => {
        setValue(v);
        props.onChange?.(v);
      }}
    />
  );
}

describe("TimeField", () => {
  it("always shows a 24-hour clock, whatever the locale", async () => {
    await render(
      <TimeField locale="en-US" value="21:00" onChange={() => {}} />
    );
    expect(box().value).toBe("21:00");
    expect(box().value).not.toMatch(/PM/);
    expect(box().placeholder).toBe("HH:MM");
    await cleanup();
    await render(
      <TimeField locale="tr-TR" value="09:05:30" onChange={() => {}} />
    );
    expect(box().value).toBe("09:05");
    await cleanup();
    await render(<TimeField locale="tr-TR" />);
    expect(box().placeholder).toBe("SS:DD");
    expect(box().getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("masks typed digits and takes a complete time as it is typed", async () => {
    const onChange = vi.fn();
    await render(<ControlledTime onChange={onChange} />);
    await type(box(), "2");
    expect(box().value).toBe("2");
    await type(box(), "21");
    expect(box().value).toBe("21:");
    await type(box(), "21:3");
    expect(box().value).toBe("21:3");
    expect(onChange).not.toHaveBeenCalled();
    await type(box(), "21:30");
    expect(onChange).toHaveBeenLastCalledWith("21:30");
    expect(box().value).toBe("21:30");
    expect(
      (document.querySelector('input[type="hidden"]') as HTMLInputElement).value
    ).toBe("21:30");
    // a one-digit hour on blur
    await type(box(), "9");
    expect(box().value).toBe("09:");
    await blur(box());
    expect(onChange).toHaveBeenLastCalledWith("09:00");
    expect(box().value).toBe("09:00");
  });

  it("marks what is not a time invalid and keeps the last value", async () => {
    const onChange = vi.fn();
    const onBad = vi.fn();
    await render(
      <TimeField
        locale="tr-TR"
        defaultValue="10:00"
        onChange={onChange}
        onBadInputChange={onBad}
        name="t"
      />
    );
    await type(box(), "25:00");
    expect(onChange).not.toHaveBeenCalled();
    const enter = await press(box(), "Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(onBad).toHaveBeenLastCalledWith(true);
    expect(
      (document.querySelector('input[name="t"]') as HTMLInputElement).value
    ).toBe("10:00");
  });

  it("steps the hour or the minute under the caret with the arrow keys", async () => {
    const onChange = vi.fn();
    await render(<ControlledTime initial="21:00" onChange={onChange} />);
    await caret(box(), 1);
    await press(box(), "ArrowUp");
    expect(onChange).toHaveBeenLastCalledWith("22:00");
    expect(box().value).toBe("22:00");
    expect([box().selectionStart, box().selectionEnd]).toEqual([0, 2]);
    await caret(box(), 4);
    await press(box(), "ArrowDown");
    expect(onChange).toHaveBeenLastCalledWith("22:59");
    expect([box().selectionStart, box().selectionEnd]).toEqual([3, 5]);
    await caret(box(), 0);
    await press(box(), "ArrowUp");
    await press(box(), "ArrowUp");
    expect(onChange).toHaveBeenLastCalledWith("00:59");
  });

  it("lists the day at the step for a pointer, the value selected and in focus", async () => {
    const onChange = vi.fn();
    await render(<ControlledTime initial="21:00" onChange={onChange} />);
    await click(listButton());
    await settle(30);
    const listbox = document.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox.getAttribute("aria-label")).toBe("Saat seç");
    expect(options()).toHaveLength(96);
    expect(options()[0]?.textContent).toBe("00:00");
    expect(option("21:00").getAttribute("aria-selected")).toBe("true");
    expect(option("21:15").getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(option("21:00"));
    await press(option("21:00"), "ArrowDown");
    expect(document.activeElement).toBe(option("21:15"));
    await press(option("21:15"), "Enter");
    await settle(30);
    expect(onChange).toHaveBeenLastCalledWith("21:15");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(box());
    await click(listButton());
    await settle(30);
    await click(option("09:30"));
    await settle(30);
    expect(onChange).toHaveBeenLastCalledWith("09:30");
    expect(box().value).toBe("09:30");
  });

  it("takes another step and disables the times outside min and max", async () => {
    await render(
      <TimeField
        locale="tr-TR"
        stepMinutes={30}
        min="08:00"
        max="17:00"
        defaultValue="10:00"
      />
    );
    await click(listButton());
    await settle(30);
    expect(options()).toHaveLength(48);
    expect(option("07:30").getAttribute("aria-disabled")).toBe("true");
    expect(option("08:00").hasAttribute("aria-disabled")).toBe(false);
    expect(option("17:30").getAttribute("aria-disabled")).toBe("true");
  });

  it("is labelled by its Field", async () => {
    await render(
      <Field label="Başlama saati" error="Saat seçin.">
        <TimeField locale="tr-TR" />
      </Field>
    );
    const label = document.querySelector("label.mds-label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(box().id);
    expect(box().getAttribute("aria-invalid")).toBe("true");
  });
});
