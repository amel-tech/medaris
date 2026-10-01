// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/mds/button";
import { IconButton } from "../src/mds/icon-button";
import { cleanup, click, key, render } from "./render";

afterEach(cleanup);

describe("Button", () => {
  it("is a type=button .mds-btn with size and variant classes", async () => {
    const host = await render(<Button>Ders oluştur</Button>);
    const b = host.querySelector("button") as HTMLButtonElement;
    expect(b.type).toBe("button");
    expect(b.className).toBe("mds-btn mds-btn--regular mds-btn--primary");
    expect(b.textContent).toBe("Ders oluştur");
    expect(host.querySelector("output")).toBeNull();
  });

  it("keeps type=submit and adds the full-width modifier", async () => {
    const host = await render(
      <Button type="submit" size="large" variant="outline" fullWidth>
        Kaydet
      </Button>
    );
    const b = host.querySelector("button") as HTMLButtonElement;
    expect(b.type).toBe("submit");
    expect(b.className).toContain(
      "mds-btn--large mds-btn--outline mds-btn--full"
    );
  });

  it("uses native disabled and swallows the click", async () => {
    const onClick = vi.fn();
    const host = await render(
      <Button disabled onClick={onClick}>
        Sil
      </Button>
    );
    const b = host.querySelector("button") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    await click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("busy: aria-busy and aria-disabled, never disabled; click and Enter do nothing", async () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    const host = await render(
      <Button loading onClick={onClick} onKeyDown={onKeyDown}>
        Kaydet
      </Button>
    );
    const b = host.querySelector("button") as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.querySelector(".mds-btn__spinner")).not.toBeNull();
    expect(host.querySelector("output")?.textContent).toBe("Yükleniyor");
    await click(b);
    await key(b, "Enter");
    await key(b, " ");
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("renders the status region empty while loading is false, so it is in the page before it speaks", async () => {
    const host = await render(<Button loading={false}>Kaydet</Button>);
    const s = host.querySelector("output");
    expect(s).not.toBeNull();
    expect(s?.textContent).toBe("");
    expect(host.querySelector("button")?.hasAttribute("aria-busy")).toBe(false);
  });

  it("a link stays an <a class=mds-btn>", async () => {
    const host = await render(
      <Button href="/dersler/emsile" variant="outline">
        Dersi gör
      </Button>
    );
    const a = host.querySelector("a") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/dersler/emsile");
    expect(a.className).toBe("mds-btn mds-btn--regular mds-btn--outline");
    expect(host.querySelector("button")).toBeNull();
  });

  it("a disabled link drops href and keeps role=link", async () => {
    const onClick = vi.fn();
    const host = await render(
      <Button href="/x" disabled onClick={onClick}>
        Dersi gör
      </Button>
    );
    const a = host.querySelector("a") as HTMLAnchorElement;
    expect(a.hasAttribute("href")).toBe(false);
    expect(a.getAttribute("role")).toBe("link");
    expect(a.getAttribute("aria-disabled")).toBe("true");
    await click(a);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("is a square .mds-btn named by aria-label", async () => {
    const onClick = vi.fn();
    const host = await render(
      <IconButton
        label="Bildirimler"
        icon={<svg aria-hidden="true" />}
        onClick={onClick}
      />
    );
    const b = host.querySelector("button") as HTMLButtonElement;
    expect(b.getAttribute("aria-label")).toBe("Bildirimler");
    expect(b.className).toBe(
      "mds-btn mds-icon-btn mds-btn--regular mds-btn--ghost"
    );
    await click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
