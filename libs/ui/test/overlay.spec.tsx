// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertDialog, AlertDialogTrigger } from "../src/mds/alert-dialog";
import { AppBar } from "../src/mds/app-bar";
import { AppProviders } from "../src/mds/app-providers";
import { AppShell, Sidebar, TopBar } from "../src/mds/app-shell";
import { Button } from "../src/mds/button";
import { Dialog, DialogClose, DialogTrigger } from "../src/mds/dialog";
import { Logo } from "../src/mds/logo";
import { toastTiming, useToaster } from "../src/mds/toast";
import { cleanup, click, key, render, settle } from "./render";

afterEach(cleanup);

const body = () => document.body;

describe("Dialog", () => {
  it("names itself by its title, describes itself by its body and draws the system's parts", async () => {
    await render(
      <Dialog
        open
        eyebrow="Nûruosmaniye Köşkü"
        title="Dersi yayından kaldır"
        footer={<DialogClose />}
      >
        <p>Talebeler artık göremez.</p>
      </Dialog>
    );
    const popup = body().querySelector(".mds-dialog") as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.className).toBe("mds-dialog");
    const title = popup.querySelector("h2.mds-dialog__title") as HTMLElement;
    expect(title.textContent).toBe("Dersi yayından kaldır");
    expect(popup.getAttribute("aria-labelledby")).toBe(title.id);
    const desc = popup.querySelector(".mds-dialog__body") as HTMLElement;
    expect(desc.tagName).toBe("DIV");
    expect(popup.getAttribute("aria-describedby")).toBe(desc.id);
    expect(popup.querySelector(".mds-eyebrow")?.textContent).toBe(
      "Nûruosmaniye Köşkü"
    );
    const close = popup.querySelector(
      "button.mds-dialog__close"
    ) as HTMLElement;
    expect(close.getAttribute("aria-label")).toBe("Kapat");
    expect(close.className).toBe(
      "mds-btn mds-icon-btn mds-btn--small mds-btn--ghost mds-dialog__close"
    );
    expect(body().querySelector(".mds-scrim")).not.toBeNull();
    expect(
      body().querySelector(".mds-dialog-viewport > .mds-dialog")
    ).not.toBeNull();
    expect(
      popup.querySelector(".mds-dialog__footer .mds-btn--ghost")?.textContent
    ).toBe("Vazgeç");
  });

  it("takes a size class and a footer meta", async () => {
    await render(
      <Dialog
        open
        title="Tam müfredat"
        size="lg"
        footerMeta="Son güncelleme: 3 Ekim 2026"
      >
        x
      </Dialog>
    );
    expect(body().querySelector(".mds-dialog")?.className).toBe(
      "mds-dialog mds-dialog--lg"
    );
    expect(body().querySelector(".mds-dialog__meta")?.textContent).toBe(
      "Son güncelleme: 3 Ekim 2026"
    );
  });

  it("opens from its trigger, closes with Vazgeç and reports each change", async () => {
    const onOpenChange = vi.fn();
    const host = await render(
      <Dialog
        title="Yasakla"
        onOpenChange={onOpenChange}
        trigger={
          <DialogTrigger>
            <Button>Yasakla</Button>
          </DialogTrigger>
        }
        footer={<DialogClose />}
      >
        x
      </Dialog>
    );
    expect(body().querySelector(".mds-dialog")).toBeNull();
    await click(host.querySelector("button") as HTMLElement);
    await settle();
    expect(body().querySelector(".mds-dialog")).not.toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const cancel = Array.from(
      body().querySelectorAll(".mds-dialog__footer button")
    ).find((b) => b.textContent === "Vazgeç") as HTMLElement;
    await click(cancel);
    await settle(60);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("a form dialog is a form that submits through its footer button", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    await render(
      <Dialog
        open
        form
        title="Yasakla"
        onSubmit={onSubmit}
        footer={
          <>
            <DialogClose />
            <Button type="submit">Yasakla</Button>
          </>
        }
      >
        <textarea name="gerekce" />
      </Dialog>
    );
    const form = body().querySelector(
      "form.mds-dialog__panel"
    ) as HTMLFormElement;
    expect(form).not.toBeNull();
    await click(form.querySelector("button[type=submit]") as HTMLElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Esc closes it", async () => {
    const onOpenChange = vi.fn();
    await render(
      <Dialog open title="Oku" onOpenChange={onOpenChange}>
        x
      </Dialog>
    );
    await settle();
    await key(document.activeElement ?? body(), "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("AlertDialog", () => {
  it("is an alertdialog; Vazgeç comes first and holds the initial focus", async () => {
    const onConfirm = vi.fn();
    await render(
      <AlertDialog
        open
        eyebrow="Nûruosmaniye Köşkü"
        title="Dersi gizle"
        confirmLabel="Gizle"
        onConfirm={onConfirm}
      >
        <p>Hiçbir şey silinmez.</p>
      </AlertDialog>
    );
    await settle();
    const popup = body().querySelector(".mds-dialog") as HTMLElement;
    expect(popup.getAttribute("role")).toBe("alertdialog");
    const buttons = Array.from(
      popup.querySelectorAll(".mds-dialog__footer button")
    );
    expect(buttons.map((b) => b.textContent)).toEqual(["Vazgeç", "Gizle"]);
    expect(buttons[0]?.className).toBe(
      "mds-btn mds-btn--regular mds-btn--ghost"
    );
    expect(buttons[1]?.className).toContain("mds-btn--primary");
    expect(document.activeElement).toBe(buttons[0]);
    await click(buttons[1] as HTMLElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirm disabled until the answer is valid", async () => {
    const onConfirm = vi.fn();
    await render(
      <AlertDialog
        open
        title="Bu grubu 3 kişi kullanıyor"
        confirmLabel="Sil"
        confirmVariant="destructive"
        confirmDisabled
        onConfirm={onConfirm}
      >
        x
      </AlertDialog>
    );
    const confirm = body().querySelector(
      ".mds-btn--destructive"
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opens from its trigger", async () => {
    const host = await render(
      <AlertDialog
        title="Sil"
        confirmLabel="Sil"
        onConfirm={() => {}}
        trigger={
          <AlertDialogTrigger>
            <Button>Sil</Button>
          </AlertDialogTrigger>
        }
      >
        x
      </AlertDialog>
    );
    expect(body().querySelector(".mds-dialog")).toBeNull();
    await click(host.querySelector("button") as HTMLElement);
    await settle();
    expect(body().querySelector(".mds-dialog")).not.toBeNull();
  });
});

describe("toastTiming (canvas rule 21)", () => {
  it("success and info close themselves after 6 s, 10 s with an action", () => {
    expect(toastTiming("success", false)).toEqual({
      timeout: 6000,
      priority: "low",
    });
    expect(toastTiming("info", true)).toEqual({
      timeout: 10000,
      priority: "low",
    });
  });
  it("warning and error stay and are announced urgently", () => {
    expect(toastTiming("warning", false)).toEqual({
      timeout: 0,
      priority: "high",
    });
    expect(toastTiming("error", true)).toEqual({
      timeout: 0,
      priority: "high",
    });
  });
});

function Fire({ tone }: { tone?: "success" | "error" }) {
  const { notify } = useToaster();
  return (
    <Button
      onClick={() =>
        notify({
          tone,
          title: "Ders gizlendi",
          description: "Arşiv’den geri alabilirsiniz.",
          action: { label: "Geri al", onClick: () => {} },
        })
      }
    >
      Tetikle
    </Button>
  );
}

describe("AppProviders, Toaster and useToaster", () => {
  it("roots the app in an isolated context with one Bildirimler region", async () => {
    const host = await render(
      <AppProviders>
        <p>içerik</p>
      </AppProviders>
    );
    expect((host.firstElementChild as HTMLElement).className).toBe("isolate");
    const region = body().querySelector(".mds-toaster") as HTMLElement;
    expect(region.getAttribute("aria-label")).toBe("Bildirimler");
    expect(body().querySelectorAll(".mds-toaster").length).toBe(1);
  });

  it("shows a success toast with its title, description, action and close", async () => {
    const host = await render(
      <AppProviders>
        <Fire />
      </AppProviders>
    );
    await click(host.querySelector("button") as HTMLElement);
    await settle();
    const toast = body().querySelector(".mds-toast") as HTMLElement;
    expect(toast).not.toBeNull();
    expect(toast.className).toContain("mds-toast--success");
    expect(toast.querySelector(".mds-toast__title")?.tagName).toBe("P");
    expect(toast.querySelector(".mds-toast__title")?.textContent).toBe(
      "Ders gizlendi"
    );
    expect(toast.querySelector(".mds-toast__desc")?.textContent).toBe(
      "Arşiv’den geri alabilirsiniz."
    );
    expect(toast.querySelector(".mds-toast__action button")?.textContent).toBe(
      "Geri al"
    );
    expect(
      toast.querySelector("button.mds-toast__close")?.getAttribute("aria-label")
    ).toBe("Kapat");
    expect(toast.getAttribute("role")).toBe("dialog");
  });

  it("an error toast is urgent: alertdialog", async () => {
    const host = await render(
      <AppProviders>
        <Fire tone="error" />
      </AppProviders>
    );
    await click(host.querySelector("button") as HTMLElement);
    await settle();
    const toast = body().querySelector(".mds-toast--error") as HTMLElement;
    expect(toast.getAttribute("role")).toBe("alertdialog");
  });
});

describe("AppBar", () => {
  const bar = (
    <AppBar
      title="Dersler"
      logo={<Logo app="nizam" size="sm" />}
      footer={
        <a className="mds-nav-user" href="/ayarlar">
          Hesap
        </a>
      }
    >
      <a href="/dersler">Dersler</a>
    </AppBar>
  );

  it("draws the bar: a named menu button, the mark, the title and no sheet while closed", async () => {
    const host = await render(bar);
    const header = host.querySelector("header.mds-appbar") as HTMLElement;
    const menu = header.querySelector("button.mds-appbar__menu") as HTMLElement;
    expect(menu.getAttribute("aria-label")).toBe("Menü");
    expect(menu.className).toBe(
      "mds-btn mds-icon-btn mds-btn--large mds-btn--ghost mds-appbar__menu"
    );
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(header.querySelector(".mds-logo")).not.toBeNull();
    expect(
      header.querySelector("p.mds-appbar__title")?.getAttribute("dir")
    ).toBe("auto");
    expect(body().querySelector(".mds-sheet")).toBeNull();
  });

  it("opens the nav sheet: logo and close, a named nav, the account foot, no sign-out", async () => {
    const host = await render(bar);
    await click(host.querySelector("button.mds-appbar__menu") as HTMLElement);
    await settle();
    const sheet = body().querySelector(".mds-sheet") as HTMLElement;
    expect(sheet).not.toBeNull();
    expect(sheet.getAttribute("aria-label")).toBe("Ana menü");
    expect(sheet.querySelector(".mds-sheet__head .mds-logo")).not.toBeNull();
    expect(
      sheet.querySelector(".mds-sheet__close")?.getAttribute("aria-label")
    ).toBe("Kapat");
    expect(sheet.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Ana menü"
    );
    expect(
      sheet
        .querySelector(".mds-sheet__foot a.mds-nav-user")
        ?.getAttribute("href")
    ).toBe("/ayarlar");
    expect(sheet.textContent).not.toContain("Çıkış yap");
    expect(
      (
        host.querySelector("button.mds-appbar__menu") as HTMLElement
      ).getAttribute("aria-expanded")
    ).toBe("true");
    await click(sheet.querySelector(".mds-sheet__close") as HTMLElement);
    await settle(60);
    expect(body().querySelector(".mds-sheet")).toBeNull();
  });
});

describe("AppShell, Sidebar and TopBar", () => {
  it("places the sidebar and the main with Tailwind utilities and logical properties", async () => {
    const host = await render(
      <AppShell
        sidebar={
          <Sidebar brand={<span>marka</span>} footer={<span>kullanıcı</span>}>
            <a href="/">Ana</a>
          </Sidebar>
        }
        appBar={<span data-bar />}
      >
        <h1>Sayfa</h1>
      </AppShell>
    );
    const aside = host.querySelector("aside") as HTMLElement;
    expect(aside.className).toContain("max-md:hidden");
    expect(aside.className).toContain("border-e");
    expect(aside.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Ana menü"
    );
    expect(host.querySelector("main")?.textContent).toBe("Sayfa");
    expect(host.querySelector("[data-bar]")).not.toBeNull();
    const all = host.innerHTML;
    // MDS-LAY-05: no physical-side utilities
    expect(all).not.toMatch(
      /\b(ml|mr|pl|pr)-\d|\bborder-(l|r)\b|\b(left|right)-\d/
    );
  });

  it("puts the density on the main only when the app asks for it", async () => {
    const dense = await render(
      <AppShell sidebar={<aside />} density="compact">
        <h1>Sayfa</h1>
      </AppShell>
    );
    expect(dense.querySelector("main")?.getAttribute("data-density")).toBe(
      "compact"
    );
    const plain = await render(
      <AppShell sidebar={<aside />}>
        <h1>Sayfa</h1>
      </AppShell>
    );
    expect(plain.querySelector("main")?.hasAttribute("data-density")).toBe(
      false
    );
  });

  it("draws no empty nav landmark in a sidebar or a sheet that has no items", async () => {
    const host = await render(
      <AppShell
        sidebar={
          <Sidebar brand={<span>marka</span>} footer={<span>kullanıcı</span>} />
        }
        appBar={
          <AppBar
            title="Nazar"
            logo={<Logo app="nazar" size="sm" />}
            footer={<span>kullanıcı</span>}
          />
        }
      >
        <h1>Sayfa</h1>
      </AppShell>
    );
    expect(host.querySelector("aside nav")).toBeNull();
    await click(host.querySelector("button.mds-appbar__menu") as HTMLElement);
    await settle();
    expect(body().querySelector(".mds-sheet")).not.toBeNull();
    expect(body().querySelector(".mds-sheet nav")).toBeNull();
    expect(body().querySelector(".mds-sheet__foot")?.textContent).toBe(
      "kullanıcı"
    );
  });

  it("TopBar puts the end side at the inline end", async () => {
    const host = await render(
      <TopBar brand={<span>m</span>} end={<span data-end />}>
        <nav />
      </TopBar>
    );
    expect(host.querySelector("header")?.className).toContain("sticky");
    expect(
      host.querySelector("[data-end]")?.parentElement?.className
    ).toContain("ms-auto");
  });
});

describe("stack-24 round 1 fixes", () => {
  it("closes the AppBar sheet when a nav link is followed", async () => {
    const host = await render(
      <AppBar title="Dersler" logo={<Logo app="nizam" size="sm" />}>
        <a href="#x">Diger</a>
      </AppBar>
    );
    await click(host.querySelector("button.mds-appbar__menu") as HTMLElement);
    await settle();
    expect(body().querySelector(".mds-sheet")).not.toBeNull();
    await click(
      body().querySelector(".mds-sheet nav a[href='#x']") as HTMLElement
    );
    await settle();
    expect(body().querySelector(".mds-sheet")).toBeNull();
  });

  it("makes the lg reading body a named, focusable region and starts focus there", async () => {
    await render(
      <Dialog open size="lg" title="Okuma" footer={<DialogClose />}>
        <p>Uzun metin.</p>
      </Dialog>
    );
    await settle();
    const bodyEl = body().querySelector(".mds-dialog__body") as HTMLElement;
    expect(bodyEl.getAttribute("role")).toBe("region");
    expect(bodyEl.getAttribute("tabindex")).toBe("0");
    const title = body().querySelector(".mds-dialog__title") as HTMLElement;
    expect(bodyEl.getAttribute("aria-labelledby")).toBe(title.id);
    expect(document.activeElement).toBe(bodyEl);
  });
});
