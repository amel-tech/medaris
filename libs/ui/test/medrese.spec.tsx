// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Avatar, initials } from "../src/mds/avatar";
import { LessonRow } from "../src/mds/lesson-row";
import { Progress } from "../src/mds/progress";
import { SessionJoin } from "../src/mds/session-join";
import { WeekAccordion, Weeks } from "../src/mds/week-accordion";
import { cleanup, click, render, settle } from "./render";

afterEach(cleanup);

describe("initials", () => {
  it("skips particles and honorifics and keeps the surname of a double given name", () => {
    expect(initials("Ahmed b. Hanbel")).toBe("AH");
    expect(initials("İsmail Hakkı Efendi")).toBe("İH");
    expect(initials("Mehmed Âkif Ersoy")).toBe("ME");
    expect(initials("Zeynep Kübra Demirci")).toBe("ZD");
    expect(initials("Zeynep Kübra Aksoy")).toBe("ZA");
    expect(initials("Hoca")).toBe("");
    expect(initials("ismail")).toBe("İ");
    expect(initials("")).toBe("");
  });
});

describe("Avatar", () => {
  it("is an image named by the person; the initials stand in without a photo", async () => {
    const host = await render(
      <Avatar name="İsmail Hakkı Efendi" locale="tr-TR" />
    );
    const a = host.querySelector(".mds-avatar") as HTMLElement;
    expect(a.className).toBe("mds-avatar");
    expect(a.getAttribute("role")).toBe("img");
    expect(a.getAttribute("aria-label")).toBe("İsmail Hakkı Efendi");
    expect(a.textContent).toBe("İH");
  });

  it("is hidden beside the printed name or without one; entity and sizes are classes", async () => {
    const host = await render(
      <>
        <Avatar name="Abdülhamit Karaosmanoğlu" decorative size="sm" />
        <Avatar />
        <Avatar name="Süleymaniye Medresesi" entity size="lg" />
      </>
    );
    const [a, b, c] = Array.from(host.querySelectorAll(".mds-avatar"));
    expect(a?.getAttribute("aria-hidden")).toBe("true");
    expect(a?.hasAttribute("role")).toBe(false);
    expect(a?.className).toBe("mds-avatar mds-avatar--sm");
    expect(b?.getAttribute("aria-hidden")).toBe("true");
    expect(c?.className).toBe("mds-avatar mds-avatar--lg mds-avatar--entity");
    expect(c?.textContent).toBe("SM");
  });

  it("gives a Latin name on an Arabic-script page lang=tr", async () => {
    const host = await render(<Avatar name="Mehmed Âkif Ersoy" locale="ar" />);
    expect(host.querySelector(".mds-avatar")?.getAttribute("lang")).toBe("tr");
  });
});

describe("Progress", () => {
  it("is a progressbar named by its visible label, with the percent as aria-valuetext", async () => {
    const host = await render(
      <Progress label="Bakara Sûresi" value={72} showValue locale="tr-TR" />
    );
    const bar = host.querySelector("[role=progressbar]") as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("72");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("%72");
    const label = host.querySelector(
      ".mds-progress__label span"
    ) as HTMLElement;
    expect(label.textContent).toBe("Bakara Sûresi");
    expect(bar.getAttribute("aria-labelledby")).toBe(label.id);
    const v = host.querySelector(".mds-progress__value") as HTMLElement;
    expect(v.textContent).toBe("%72");
    expect(v.getAttribute("aria-hidden")).toBe("true");
    const fill = host.querySelector(".mds-progress__bar") as HTMLElement;
    expect(fill.style.getPropertyValue("--mds-progress")).toBe("72%");
  });

  it("clamps, and a full bar reads tamamlandı after a check", async () => {
    const host = await render(
      <>
        <Progress label="a" value={140} showValue locale="tr-TR" />
        <Progress label="b" value={-5} locale="tr-TR" />
      </>
    );
    const [full, empty] = Array.from(
      host.querySelectorAll("[role=progressbar]")
    );
    expect(full?.getAttribute("aria-valuenow")).toBe("100");
    expect(full?.getAttribute("aria-valuetext")).toBe("%100 tamamlandı");
    expect(host.querySelector(".mds-progress__check")).not.toBeNull();
    expect(empty?.getAttribute("aria-valuenow")).toBe("0");
    expect(host.querySelectorAll(".mds-progress__value").length).toBe(1);
  });
});

describe("LessonRow", () => {
  it("is an li with a type label, a link title and the duration", async () => {
    const host = await render(
      <ol>
        <LessonRow
          title="Mehmûz fiiller"
          type="video"
          href="/celse/5"
          durationMinutes={105}
          locale="tr-TR"
        />
      </ol>
    );
    const li = host.querySelector("li") as HTMLElement;
    expect(li.className).toBe("mds-lesson-row mds-lesson-row--video");
    const a = li.querySelector("a.mds-lesson-row__title") as HTMLElement;
    expect(a.getAttribute("href")).toBe("/celse/5");
    expect(li.querySelector(".mds-lesson-row__meta")?.textContent).toBe(
      "Video ders"
    );
    const t = li.querySelector("time.mds-lesson-row__duration") as HTMLElement;
    expect(t.getAttribute("datetime")).toBe("PT105M");
    expect(t.textContent).toBe("105 dk");
  });

  it("current is a step with the marker; done speaks tamamlandı; locked has no link", async () => {
    const host = await render(
      <ol>
        <LessonRow title="A" type="live" state="current" href="/a" />
        <LessonRow title="B" type="quiz" state="done" />
        <LessonRow title="C" type="document" access="locked" href="/c" />
      </ol>
    );
    const [cur, done, locked] = Array.from(host.querySelectorAll("li"));
    expect(cur?.querySelector("[aria-current=step]")).not.toBeNull();
    expect(cur?.querySelector(".mds-lesson-row__marker")?.textContent).toBe(
      "Sıradaki"
    );
    expect(done?.className).toContain("is-done");
    expect(done?.querySelector(".mds-visually-hidden")?.textContent).toBe(
      ", tamamlandı"
    );
    expect(locked?.className).toContain("is-locked");
    expect(locked?.querySelector("a")).toBeNull();
    expect(
      locked?.querySelector("[role=img]")?.getAttribute("aria-label")
    ).toBe("Kilitli");
  });

  it("viewing is the page, tinted and marked, and wins over current", async () => {
    const host = await render(
      <ol>
        <LessonRow title="A" type="live" viewing href="/a" />
        <LessonRow title="B" type="live" state="current" viewing href="/b" />
      </ol>
    );
    const [only, both] = Array.from(host.querySelectorAll("li"));
    expect(only?.className).toContain("is-viewing");
    expect(only?.querySelector("[aria-current=page]")).not.toBeNull();
    expect(only?.querySelector(".mds-lesson-row__marker")?.textContent).toBe(
      "Bu celse"
    );
    expect(both?.querySelector("[aria-current=step]")).toBeNull();
    expect(
      Array.from(both?.querySelectorAll(".mds-lesson-row__marker") ?? []).map(
        (m) => m.textContent
      )
    ).toEqual(["Bu celse", "Sıradaki"]);
  });

  it("prints the course zone and the viewer's own time when the zones differ", async () => {
    const host = await render(
      <ol>
        <LessonRow
          title="Canlı"
          type="live"
          startsAt="2026-10-03T18:00:00Z"
          timeZone="Europe/Berlin"
          courseTimeZone="Europe/Istanbul"
          locale="tr-TR"
        />
      </ol>
    );
    const meta = host.querySelector(".mds-lesson-row__meta") as HTMLElement;
    expect(meta.textContent).toContain("21:00 İstanbul");
    expect(meta.textContent).toContain("20:00 senin saatinle");
    expect(meta.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-10-03T18:00:00Z"
    );
    // every part but the last ends on its separator
    expect(meta.querySelectorAll(".mds-sep").length).toBe(2);
  });
});

describe("SessionJoin", () => {
  const base = {
    startsAt: "2026-10-03T18:00:00Z",
    timeZone: "Europe/Istanbul",
    locale: "tr-TR",
    title: "Emsile 5. celse",
    href: "https://meet.example/abc",
    platform: "google-meet",
  };

  it("keeps the link away until the join window opens", async () => {
    const host = await render(
      <SessionJoin {...base} now="2026-10-03T17:00:00Z" />
    );
    expect(host.querySelector("a.mds-join__link")).toBeNull();
    expect(host.querySelector(".mds-join__status")?.textContent).toBe(
      "Katılım, celse başlamadan 10 dakika önce açılır."
    );
    expect(host.querySelector(".mds-badge--secondary time")?.textContent).toBe(
      "1 saat sonra"
    );
  });

  it("opens in a new tab with the URL revealed on demand", async () => {
    const host = await render(
      <SessionJoin {...base} now="2026-10-03T17:55:00Z" />
    );
    const a = host.querySelector("a.mds-join__link") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://meet.example/abc");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.querySelector(".mds-visually-hidden")?.textContent).toBe(
      " (yeni sekmede açılır)"
    );
    expect(host.querySelector(".mds-join__url")?.getAttribute("dir")).toBe(
      "ltr"
    );
    expect(host.querySelector(".mds-platform-chip")?.textContent).toBe(
      "Google Meet"
    );
    const section = host.querySelector("section") as HTMLElement;
    expect(section.getAttribute("aria-labelledby")?.split(" ").length).toBe(2);
  });

  it("live is joinable now; cancelled and locked never show the link", async () => {
    const host = await render(
      <>
        <SessionJoin {...base} state="live" now="2026-10-03T18:30:00Z" />
        <SessionJoin {...base} state="cancelled" now="2026-10-03T17:55:00Z" />
        <SessionJoin {...base} access="locked" now="2026-10-03T17:55:00Z" />
      </>
    );
    const [live, cancelled, locked] = Array.from(
      host.querySelectorAll("section")
    );
    expect(live?.querySelector(".mds-badge--live")?.textContent).toBe(
      "Şu an canlı"
    );
    expect(live?.querySelector("a.mds-join__link")).not.toBeNull();
    expect(cancelled?.querySelector("a.mds-join__link")).toBeNull();
    expect(cancelled?.querySelector(".mds-join__status")?.textContent).toBe(
      "Bu celse iptal edildi."
    );
    expect(locked?.querySelector("a.mds-join__link")).toBeNull();
    expect(locked?.querySelector(".mds-join__status--locked")).not.toBeNull();
  });

  it("a live celse says how long it has run, after its length; no other state does", async () => {
    const host = await render(
      <>
        <SessionJoin
          {...base}
          durationMinutes={60}
          state="live"
          elapsedText="14 dakikadır sürüyor"
          now="2026-10-03T18:14:00Z"
        />
        <SessionJoin
          {...base}
          durationMinutes={60}
          state="ended"
          elapsedText="14 dakikadır sürüyor"
          now="2026-10-04T00:00:00Z"
        />
      </>
    );
    const [live, ended] = Array.from(host.querySelectorAll("section"));
    const zones = Array.from(
      live?.querySelectorAll(".mds-join__zone") ?? []
    ).map((el) => el.textContent);
    expect(zones).toEqual(["60 dk", "14 dakikadır sürüyor"]);
    expect(ended?.textContent).not.toContain("dakikadır sürüyor");
  });

  it("an ended celse offers the recordings; a missing link says so", async () => {
    const host = await render(
      <>
        <SessionJoin
          {...base}
          state="ended"
          recordingsHref="/kayitlar"
          now="2026-10-04T00:00:00Z"
        />
        <SessionJoin {...base} href={undefined} now="2026-10-03T17:55:00Z" />
      </>
    );
    const [ended, nolink] = Array.from(host.querySelectorAll("section"));
    expect(ended?.querySelector("a.mds-btn")?.getAttribute("href")).toBe(
      "/kayitlar"
    );
    expect(nolink?.querySelector(".mds-join__status")?.textContent).toBe(
      "Bağlantı henüz eklenmedi."
    );
  });
});

describe("Weeks and WeekAccordion", () => {
  const tree = (
    <Weeks>
      <WeekAccordion
        week={4}
        title="Mezîd fiiller"
        state="done"
        meta="2 celse"
        locale="tr-TR"
      />
      <WeekAccordion
        week={5}
        title="Mehmûz fiiller"
        state="active"
        summary="Hemzeli fiiller."
        locale="tr-TR"
      >
        <LessonRow title="Kara’e" type="live" state="current" href="/celse/5" />
      </WeekAccordion>
      <WeekAccordion
        week={6}
        title="Muzâaf fiiller"
        opensOn="2026-10-10"
        locale="tr-TR"
      />
    </Weeks>
  );

  it("is one button per week in an hN heading; the active week opens by default", async () => {
    const host = await render(tree);
    const triggers = Array.from(
      host.querySelectorAll("button.mds-week__trigger")
    );
    expect(triggers.length).toBe(3);
    expect(triggers.map((t) => t.getAttribute("aria-expanded"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(host.querySelector("h3.mds-week__heading > button")).not.toBeNull();
    const weeks = Array.from(host.querySelectorAll(".mds-week"));
    expect(weeks[0]?.className).toBe("mds-week is-done");
    expect(weeks[1]?.className).toBe("mds-week is-active");
    expect(weeks[2]?.className).toBe("mds-week");
    expect(host.querySelector(".mds-weeks")).not.toBeNull();
    expect(weeks[1]?.querySelector(".mds-badge--brand")?.textContent).toBe(
      "Devam ediyor"
    );
    expect(weeks[0]?.querySelector(".mds-badge--success")?.textContent).toBe(
      "Tamamlandı"
    );
    expect(weeks[2]?.querySelector(".mds-week__meta")?.textContent).toBe(
      "10 Ekim tarihinde açılır"
    );
    expect(weeks[1]?.querySelector("ol.mds-lesson-list li")).not.toBeNull();
  });

  it("several weeks may be open at once, and a week with no lessons shows the empty line", async () => {
    const host = await render(tree);
    const triggers = Array.from(
      host.querySelectorAll("button.mds-week__trigger")
    );
    await click(triggers[2] as HTMLElement);
    await settle();
    expect(
      Array.from(host.querySelectorAll("button.mds-week__trigger")).map((t) =>
        t.getAttribute("aria-expanded")
      )
    ).toEqual(["false", "true", "true"]);
    expect(
      host.querySelectorAll(".mds-week")[2]?.querySelector(".mds-week__empty")
        ?.textContent
    ).toBe("Bu hafta için henüz celse eklenmedi.");
  });

  it("a locked week still opens; its title carries a hidden ', kilitli' and no medallion number", async () => {
    const host = await render(
      <Weeks>
        <WeekAccordion
          week={1}
          title="Kilitli hafta"
          access="locked"
          state="done"
          locale="tr-TR"
        />
      </Weeks>
    );
    const w = host.querySelector(".mds-week") as HTMLElement;
    expect(w.className).toBe("mds-week is-locked");
    expect(
      w.querySelector(".mds-week__titles .mds-visually-hidden")?.textContent
    ).toBe(", kilitli");
    expect(w.querySelector(".mds-week__medallion")?.textContent).toBe("");
    expect(w.querySelector(".mds-badge--success")).toBeNull();
  });
});
