// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Field } from "../src/mds/field";
import { Input } from "../src/mds/input";
import { Textarea } from "../src/mds/textarea";
import { cleanup, render } from "./render";

afterEach(cleanup);

describe("Field + Input", () => {
  it("names the control with the label and describes it with the help", async () => {
    const host = await render(
      <Field label="Ders adı" required help="Talebeler bu adı görür.">
        <Input defaultValue="Emsile" />
      </Field>
    );
    const input = host.querySelector("input") as HTMLInputElement;
    const label = host.querySelector("label.mds-label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(input.id);
    expect(input.id).not.toBe("");
    expect(input.className).toBe("mds-input");
    expect(
      label.querySelector(".mds-required")?.getAttribute("aria-hidden")
    ).toBe("true");
    const help = host.querySelector(".mds-help") as HTMLElement;
    expect(help.textContent).toBe("Talebeler bu adı görür.");
    expect(input.getAttribute("aria-describedby")).toContain(help.id);
    expect(host.querySelector(".mds-error")).toBeNull();
  });

  it("the error takes the help's place and marks the control invalid", async () => {
    const host = await render(
      <Field
        label="E-posta"
        help="yardım"
        error="Geçerli bir e-posta adresi yazın."
      >
        <Input type="email" />
      </Field>
    );
    const input = host.querySelector("input") as HTMLInputElement;
    const error = host.querySelector(".mds-error") as HTMLElement;
    expect(error.textContent).toBe("Geçerli bir e-posta adresi yazın.");
    expect(host.querySelector(".mds-help")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.hasAttribute("data-invalid")).toBe(true);
    expect(input.getAttribute("aria-describedby")).toContain(error.id);
  });

  it("size, mono and adornments", async () => {
    const host = await render(
      <Field label="Süre (dk)">
        <Input size="small" mono leading={<i />} trailing="dk" />
      </Field>
    );
    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.className).toBe("mds-input mds-input--small mds-input--mono");
    expect(input.getAttribute("dir")).toBe("ltr");
    const group = host.querySelector(".mds-input-group") as HTMLElement;
    expect(
      group
        .querySelector(".mds-input-group__leading")
        ?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(group.querySelector(".mds-input-group__trailing")?.textContent).toBe(
      "dk"
    );
  });
});

describe("Textarea", () => {
  it("is a <textarea class=mds-input mds-textarea> wired to its field", async () => {
    const host = await render(
      <Field label="Ret gerekçesi" error="Bir gerekçe yazın.">
        <Textarea rows={4} />
      </Field>
    );
    const ta = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.className).toBe("mds-input mds-textarea");
    expect(Number(ta.getAttribute("rows"))).toBe(4);
    expect(ta.getAttribute("aria-invalid")).toBe("true");
    expect((host.querySelector("label") as HTMLLabelElement).htmlFor).toBe(
      ta.id
    );
  });
});
