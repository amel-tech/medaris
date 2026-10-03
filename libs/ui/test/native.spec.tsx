// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert } from "../src/mds/alert";
import { AvatarStack } from "../src/mds/avatar-stack";
import { Badge } from "../src/mds/badge";
import { Breadcrumb } from "../src/mds/breadcrumb";
import { Card } from "../src/mds/card";
import { CoverPattern, coverTone } from "../src/mds/cover-pattern";
import { EmptyState } from "../src/mds/empty-state";
import { usePageLocale } from "../src/mds/locale";
import { NavItem } from "../src/mds/nav-item";
import { NavSection } from "../src/mds/nav-section";
import { PlatformChip } from "../src/mds/platform-chip";
import { Skeleton } from "../src/mds/skeleton";
import { Stat } from "../src/mds/stat";
import { SystemState } from "../src/mds/system-state";
import { Table } from "../src/mds/table";
import { cleanup, click, render } from "./render";

afterEach(cleanup);

describe("Alert", () => {
  it("announces an error and keeps the rest as status", async () => {
    const host = await render(
      <>
        <Alert tone="error" title="Kaydedilemedi">
          Tekrar deneyin.
        </Alert>
        <Alert tone="info">Bilgi</Alert>
      </>
    );
    const [err, info] = Array.from(host.querySelectorAll(".mds-alert"));
    expect(err?.getAttribute("role")).toBe("alert");
    expect(err?.className).toBe("mds-alert mds-alert--error");
    expect(err?.querySelector(".mds-alert__title")?.textContent).toBe(
      "Kaydedilemedi"
    );
    expect(
      err?.querySelector(".mds-alert__icon")?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(info?.getAttribute("role")).toBe("status");
    expect(info?.querySelector(".mds-alert__title")).toBeNull();
  });
});

describe("Badge", () => {
  it("draws the dot for the live state beside the words", async () => {
    const host = await render(
      <>
        <Badge variant="live">Şu an canlı</Badge>
        <Badge>Taslak</Badge>
      </>
    );
    const [live, plain] = Array.from(host.querySelectorAll(".mds-badge"));
    expect(live?.className).toBe("mds-badge mds-badge--live");
    expect(
      live?.querySelector(".mds-badge__dot")?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(plain?.className).toBe("mds-badge mds-badge--secondary");
    expect(plain?.querySelector(".mds-badge__dot")).toBeNull();
  });
});

describe("Card", () => {
  it("is one link in its title when it has an href", async () => {
    const host = await render(
      <Card title="Emsile" href="/dersler/1" footer={<span>35 talebe</span>}>
        içerik
      </Card>
    );
    const card = host.querySelector(".mds-card") as HTMLElement;
    expect(card.className).toContain("mds-card--interactive");
    const h = card.querySelector("h3.mds-card__title") as HTMLElement;
    expect(h.getAttribute("dir")).toBe("auto");
    expect(h.querySelector("a.mds-card__link")?.getAttribute("href")).toBe(
      "/dersler/1"
    );
    expect(card.querySelector(".mds-card__footer")?.textContent).toBe(
      "35 talebe"
    );
  });

  it("is not interactive without a title, and clamps the heading level", async () => {
    const host = await render(
      <>
        <Card href="/x" density="compact">
          a
        </Card>
        <Card title="B" headingLevel={2} />
      </>
    );
    const [a, b] = Array.from(host.querySelectorAll(".mds-card"));
    expect(a?.className).toBe("mds-card");
    expect(a?.getAttribute("data-density")).toBe("compact");
    expect(b?.querySelector("h2")).not.toBeNull();
  });
});

describe("Breadcrumb", () => {
  it("renders nothing with no parent", async () => {
    const host = await render(<Breadcrumb items={["Dersler"]} />);
    expect(host.querySelector("nav")).toBeNull();
  });

  it("marks the current page, links the parent as a back link and separates", async () => {
    const host = await render(
      <Breadcrumb
        items={[
          { label: "Nizam", href: "/" },
          { label: "Dersler", href: "/dersler" },
          "Emsile",
        ]}
      />
    );
    const nav = host.querySelector("nav") as HTMLElement;
    expect(nav.getAttribute("aria-label")).toBe("Sayfa yolu");
    const current = nav.querySelector("[aria-current=page]") as HTMLElement;
    expect(current.textContent).toBe("Emsile");
    const links = nav.querySelectorAll("a.mds-breadcrumb__link");
    expect(links.length).toBe(2);
    expect(links[0]?.querySelector(".mds-breadcrumb__back")).toBeNull();
    expect(links[1]?.querySelector(".mds-breadcrumb__back")).not.toBeNull();
    expect(nav.querySelectorAll(".mds-breadcrumb__sep").length).toBe(2);
  });
});

describe("EmptyState, NavSection, Skeleton", () => {
  it("EmptyState is one sentence, an icon and an action", async () => {
    const host = await render(
      <EmptyState
        icon={<i data-x />}
        action={<button type="button">Ekle</button>}
      >
        Henüz ders yok.
      </EmptyState>
    );
    expect(host.querySelector(".mds-empty__text")?.textContent).toBe(
      "Henüz ders yok."
    );
    expect(host.querySelector(".mds-empty__icon i")).not.toBeNull();
    expect(host.querySelector(".mds-empty button")?.textContent).toBe("Ekle");
  });

  it("NavSection is a .mds-nav-section label", async () => {
    const host = await render(<NavSection>Köşk</NavSection>);
    expect(host.querySelector(".mds-nav-section")?.textContent).toBe("Köşk");
  });

  it("Skeleton is hidden and carries its size as data variables", async () => {
    const host = await render(<Skeleton width="12rem" height="1rem" />);
    const s = host.querySelector(".mds-skeleton") as HTMLElement;
    expect(s.getAttribute("aria-hidden")).toBe("true");
    expect(s.style.getPropertyValue("--mds-skeleton-w")).toBe("12rem");
    expect(s.style.getPropertyValue("--mds-skeleton-h")).toBe("1rem");
  });
});

describe("NavItem", () => {
  it("is a link with aria-current, a locale-formatted count and a spoken label", async () => {
    const host = await render(
      <NavItem
        href="/dersler"
        active
        count={1234}
        countLabel="bağlantısı eksik"
        locale="tr-TR"
      >
        Dersler
      </NavItem>
    );
    const a = host.querySelector("a") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/dersler");
    expect(a.getAttribute("aria-current")).toBe("page");
    const count = a.querySelector(".mds-nav-item__count") as HTMLElement;
    expect(count.textContent).toBe("1.234 bağlantısı eksik");
    expect(count.querySelector(".mds-visually-hidden")?.textContent).toBe(
      " bağlantısı eksik"
    );
  });

  it("draws no count at zero and no aria-current when inactive", async () => {
    const host = await render(
      <NavItem href="/x" count={0}>
        X
      </NavItem>
    );
    expect(host.querySelector(".mds-nav-item__count")).toBeNull();
    expect(host.querySelector("a")?.hasAttribute("aria-current")).toBe(false);
  });
});

describe("Stat", () => {
  it("colours the number only beside its cue", async () => {
    const host = await render(
      <>
        <Stat label="Devamsız" value={7} tone="error" />
        <Stat
          label="Tamamlanan"
          value={1234}
          tone="success"
          cue="Arttı"
          locale="tr-TR"
        />
      </>
    );
    const [plain, cued] = Array.from(host.querySelectorAll(".mds-stat"));
    expect(plain?.className).toBe("mds-card mds-stat");
    expect(cued?.className).toBe("mds-card mds-stat mds-stat--success");
    expect(cued?.querySelector(".mds-stat__value")?.textContent).toBe(
      "Arttı1.234"
    );
  });
});

describe("usePageLocale", () => {
  function Probe({ locale }: { locale?: string }) {
    const { ref, lang } = usePageLocale<HTMLSpanElement>(locale);
    return <span ref={ref} data-lang={lang} />;
  }
  const langOf = (host: HTMLElement) =>
    host.querySelector("[data-lang]")?.getAttribute("data-lang");

  it("takes the prop, else the nearest lang, else tr-TR", async () => {
    expect(langOf(await render(<Probe />))).toBe("tr-TR");
    expect(
      langOf(
        await render(
          <div lang="ar">
            <Probe />
          </div>
        )
      )
    ).toBe("ar");
    expect(
      langOf(
        await render(
          <div lang="ar">
            <Probe locale="en-US" />
          </div>
        )
      )
    ).toBe("en-US");
  });

  it("returns the canonical form of a valid tag", async () => {
    expect(langOf(await render(<Probe locale="tr-tr" />))).toBe("tr-TR");
  });

  it("skips a tag the runtime rejects, so no consumer reaches Intl with it", async () => {
    // `tr_TR` and an empty string both make Intl throw a RangeError.
    expect(() => new Intl.DateTimeFormat("tr_TR")).toThrow(RangeError);
    expect(
      langOf(
        await render(
          <div lang="tr_TR">
            <Probe />
          </div>
        )
      )
    ).toBe("tr-TR");
    // A bad prop falls through to the nearest lang, then to the default.
    expect(
      langOf(
        await render(
          <div lang="en-US">
            <Probe locale="tr_TR" />
          </div>
        )
      )
    ).toBe("en-US");
    expect(langOf(await render(<Probe locale="" />))).toBe("tr-TR");
  });
});

describe("SystemState", () => {
  it("is the page's main named by its h1, or a section inside the shell", async () => {
    const host = await render(
      <>
        <SystemState
          title="Sayfa bulunamadı"
          action={<a href="/">Ana sayfa</a>}
        >
          Adres yanlış.
        </SystemState>
        <SystemState title="Bakımdayız" shell headingLevel={2}>
          Birazdan.
        </SystemState>
      </>
    );
    const main = host.querySelector("main") as HTMLElement;
    expect(main.className).toBe("mds-system-state mds-system-state--page");
    const h1 = main.querySelector("h1") as HTMLElement;
    expect(main.getAttribute("aria-labelledby")).toBe(h1.id);
    expect(main.querySelector("a")?.textContent).toBe("Ana sayfa");
    const section = host.querySelector("section") as HTMLElement;
    expect(section.querySelector("h2.mds-h2")).not.toBeNull();
  });

  it("restricted has no way out and is never inside the shell", async () => {
    const host = await render(
      <SystemState
        kind="restricted"
        shell
        title="Erişim kısıtlı"
        action={<a href="/">Çık</a>}
      >
        Yetkiniz yok.
      </SystemState>
    );
    expect(host.querySelector("main")).not.toBeNull();
    expect(host.querySelector("a")).toBeNull();
  });
});

describe("CoverPattern", () => {
  it("hashes a seed to the same tone everywhere (FNV-1a over UTF-8)", () => {
    expect(coverTone("ders-1")).toBe(coverTone("ders-1"));
    expect(["laciverd", "bordo", "zumrut", "murekkep"]).toContain(
      coverTone("Emsile")
    );
    // FNV-1a("") is the offset basis 2166136261, which is 1 mod 4: bordo.
    expect(coverTone("")).toBe("bordo");
  });

  it("takes a chosen tone first, then the seed, else mürekkep; sets Arabic labels in Naskh", async () => {
    const host = await render(
      <>
        <CoverPattern tone="zumrut" seed="x" />
        <CoverPattern />
        <CoverPattern label="الصرف" size="lg" />
        <CoverPattern label="Sarf" size="xs" />
      </>
    );
    const covers = Array.from(host.querySelectorAll(".mds-cover"));
    expect(covers[0]?.className).toBe("mds-cover mds-cover--zumrut");
    expect(covers[1]?.className).toBe("mds-cover mds-cover--murekkep");
    const ar = covers[2]?.querySelector(".mds-cover__label") as HTMLElement;
    expect(ar.getAttribute("lang")).toBe("ar");
    expect(ar.getAttribute("dir")).toBe("rtl");
    expect(covers[3]?.querySelector(".mds-cover__label")).toBeNull();
  });
});

describe("PlatformChip", () => {
  it("names a known platform with its dot", async () => {
    const host = await render(<PlatformChip platform="zoom" />);
    const c = host.querySelector(".mds-platform-chip") as HTMLElement;
    expect(c.className).toBe("mds-platform-chip mds-platform-chip--zoom");
    expect(c.textContent).toBe("Zoom");
    expect(c.querySelector(".mds-platform-chip__dot")).not.toBeNull();
  });

  it("an unknown meeting shows its host; an unknown recording shows the host alone", async () => {
    const host = await render(
      <>
        <PlatformChip platform="bbb" host="meet.example.org" />
        <PlatformChip platform="bbb" kind="recording" host="vimeo.com" />
        <PlatformChip platform="bbb" kind="recording" />
      </>
    );
    const chips = Array.from(host.querySelectorAll(".mds-platform-chip"));
    expect(chips.length).toBe(2);
    expect(chips[0]?.textContent).toBe("Bilinmeyen platformmeet.example.org");
    expect(chips[1]?.textContent).toBe("vimeo.com");
    expect(chips[1]?.querySelector(".mds-platform-chip__dot")).toBeNull();
  });

  it("a detected platform is a status with a spoken note", async () => {
    const host = await render(<PlatformChip platform="jitsi" detected />);
    const c = host.querySelector(".mds-platform-chip") as HTMLElement;
    expect(c.getAttribute("role")).toBe("status");
    expect(c.querySelector(".mds-visually-hidden")?.textContent).toBe(
      ", bağlantıdan algılandı"
    );
  });
});

describe("AvatarStack", () => {
  it("draws max avatars and counts the rest: +N is total minus shown", async () => {
    const host = await render(
      <AvatarStack
        label="Talebeler"
        locale="tr-TR"
        total={1500}
        people={[
          { name: "İsmail Hakkı Efendi" },
          { name: "Mehmed Âkif Ersoy" },
          { name: "Ahmed b. Hanbel" },
          { name: "Dördüncü Kişi" },
        ]}
      />
    );
    const stack = host.querySelector(".mds-avatar-stack") as HTMLElement;
    expect(stack.getAttribute("role")).toBe("group");
    const tiles = stack.querySelectorAll(".mds-avatar");
    expect(tiles.length).toBe(4);
    expect(tiles[0]?.textContent).toBe("İH");
    expect(tiles[2]?.textContent).toBe("AH");
    const more = stack.querySelector(".mds-avatar--more") as HTMLElement;
    expect(more.textContent).toBe("+1.497");
    expect(more.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Table", () => {
  const columns = [
    { key: "ad", header: "Ders", rowHeader: true, sortable: true },
    { key: "n", header: "Talebe", align: "right" as const },
  ];
  const rows = [
    { ad: "Emsile", n: 12 },
    { ad: "Bina", n: 7 },
  ];

  it("captions the table, reports a sort click and marks the sorted column", async () => {
    const onSort = vi.fn();
    const host = await render(
      <Table
        columns={columns}
        rows={rows}
        caption="Dersler"
        sort={{ key: "ad", direction: "ascending" }}
        onSortChange={onSort}
      />
    );
    const caption = host.querySelector("caption") as HTMLElement;
    expect(caption.className).toContain("mds-visually-hidden");
    const th = host.querySelector("thead th") as HTMLElement;
    expect(th.getAttribute("aria-sort")).toBe("ascending");
    await click(th.querySelector("button") as HTMLElement);
    expect(onSort).toHaveBeenCalledWith({ key: "ad", direction: "descending" });
    expect(host.querySelectorAll("tbody tr").length).toBe(2);
    expect(host.querySelector("tbody th[scope=row]")?.textContent).toBe(
      "Emsile"
    );
    expect(host.querySelectorAll("td.is-end").length).toBe(2);
  });

  it("an empty table says so across every column", async () => {
    const host = await render(
      <Table columns={columns} rows={[]} caption="Dersler" />
    );
    const td = host.querySelector("td.mds-table__empty") as HTMLElement;
    expect(td.getAttribute("colspan")).toBe("2");
    expect(td.textContent).toBe("Bu listede henüz bir şey yok.");
  });

  it("responsive=stack adds the explicit table roles and the cell labels", async () => {
    const host = await render(
      <Table
        columns={columns}
        rows={rows}
        caption="Dersler"
        responsive="stack"
      />
    );
    const table = host.querySelector("table") as HTMLElement;
    expect(table.className).toBe("mds-table mds-table--stack");
    expect(table.getAttribute("role")).toBe("table");
    expect(host.querySelector("thead tr")?.getAttribute("role")).toBe("row");
    expect(host.querySelector("tbody td")?.getAttribute("data-label")).toBe(
      "Talebe"
    );
  });
});
