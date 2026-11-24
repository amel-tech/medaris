// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  KoskRecordingListResponse,
  KoskRecordingRowResponse,
  KoskSessionListResponse,
  KoskSessionRowResponse,
  KoskStudentListResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KoskRecordingsView } from "~/features/kosk-lists/components/kosk-recordings-view";
import { KoskSessionsView } from "~/features/kosk-lists/components/kosk-sessions-view";
import { KoskStudentsView } from "~/features/kosk-lists/components/kosk-students-view";
import {
  groupRecordings,
  pageOf,
  pagerOf,
  recordingsHref,
  recordingVariant,
  searchOf,
  sessionState,
  sessionsHref,
  sessionTabOf,
  studentsHref,
} from "~/features/kosk-lists/present";

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const session = (
  over: Partial<KoskSessionRowResponse> = {}
): KoskSessionRowResponse => ({
  id: "l1",
  title: "Mehmûz fiiller",
  courseId: "c1",
  courseTitle: "Emsile ve Bina",
  madrasahName: null,
  weekNumber: 5,
  scheduledAt: new Date("2026-10-03T18:00:00Z"),
  durationMinutes: 60,
  cancelled: false,
  inPerson: false,
  ...over,
});

const sessions = (
  items: KoskSessionRowResponse[],
  over: Partial<KoskSessionListResponse> = {}
): KoskSessionListResponse => ({
  items,
  total: items.length,
  page: 1,
  limit: 20,
  upcomingCount: items.length,
  pastCount: 8,
  ...over,
});

const recording = (
  over: Partial<KoskRecordingRowResponse> = {}
): KoskRecordingRowResponse => ({
  id: "r1",
  title: "Mezîd fiiller: celse kaydı",
  lessonId: "l1",
  courseId: "c1",
  courseTitle: "Emsile ve Bina",
  weekNumber: 4,
  weekTitle: "Mezîd fiiller ve bâblar",
  sessionAt: new Date("2026-09-26T18:00:00Z"),
  durationMinutes: 58,
  provider: "BUNNY",
  status: "READY",
  visibility: "PUBLIC",
  ...over,
});

describe("köşk geneli Celseler (MDRS-211)", () => {
  it("lists the sessions with their course, time and state, each leading to the course's own Celseler", () => {
    const html = render(
      <KoskSessionsView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        tab="UPCOMING"
        data={sessions([
          session(),
          session({
            id: "l2",
            title: "Hafta sonu müzakeresi",
            courseId: "c2",
            courseTitle: "Avâmil",
            madrasahName: "Süleymaniye Medresesi",
            cancelled: true,
            inPerson: true,
          }),
        ])}
      />
    );
    for (const text of [
      "Celseler",
      "Nûruosmaniye Köşkü içindeki bütün derslerin celseleri",
      "Yaklaşan celseler",
      "Geçmiş celseler",
      "Mehmûz fiiller",
      "Hafta 5",
      "Emsile ve Bina",
      "3 Eki Cmt 21:00",
      "60 dk",
      "Planlandı",
      "Hafta sonu müzakeresi",
      "Süleymaniye Medresesi",
      "İptal edildi",
      "Yüz yüze",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('href="/kosks/k1/courses/c1/sessions"');
    expect(html).toContain('href="/kosks/k1/courses/c2/sessions"');
    // the tabs are links: the tab is in the address
    expect(html).toContain('href="/kosks/k1/celseler"');
    expect(html).toContain('href="/kosks/k1/celseler?sekme=gecmis"');
    // nothing is changed from here
    expect(html).not.toContain("İptal et");
    expect(html).not.toContain("Celse planla");
  });

  it("reads a past session as over, says when a tab is empty, and when the read failed", () => {
    const past = render(
      <KoskSessionsView
        koskId="k1"
        koskName="Köşk"
        tab="PAST"
        data={sessions([session()])}
      />
    );
    expect(past).toContain("Sona erdi");
    expect(
      render(
        <KoskSessionsView
          koskId="k1"
          koskName="Köşk"
          tab="UPCOMING"
          data={sessions([])}
        />
      )
    ).toContain("Yaklaşan celse yok.");
    const failed = render(
      <KoskSessionsView koskId="k1" koskName="Köşk" tab="PAST" data={null} />
    );
    expect(failed).toContain("Celseler okunamadı");
    expect(failed).toContain('href="/kosks/k1/celseler?sekme=gecmis"');
  });

  it("pages through a long tab, keeping the tab", () => {
    const html = render(
      <KoskSessionsView
        koskId="k1"
        koskName="Köşk"
        tab="PAST"
        data={sessions([session()], { total: 45, page: 2, limit: 20 })}
      />
    );
    expect(html).toContain("21–21 / 45");
    expect(html).toContain('href="/kosks/k1/celseler?sekme=gecmis"');
    expect(html).toContain(
      'href="/kosks/k1/celseler?sekme=gecmis&amp;sayfa=3"'
    );
  });
});

describe("köşk geneli Talebeler (MDRS-211)", () => {
  const data = (
    over: Partial<KoskStudentListResponse> = {}
  ): KoskStudentListResponse => ({
    items: [
      {
        userId: "u1",
        name: "Rümeysa Nur Karaca",
        email: "rumeysa@example.com",
        firstEnrolledAt: new Date("2026-09-01T10:00:00Z"),
        courses: [
          { id: "c1", title: "Emsile ve Bina", status: "ENROLLED" },
          { id: "c2", title: "Avâmil", status: "COMPLETED" },
        ],
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    pendingCount: 0,
    ...over,
  });

  it("lists a row a person with the courses they hold, each leading to the course's own Talebeler", () => {
    const html = render(
      <KoskStudentsView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        q=""
        data={data()}
      />
    );
    for (const text of [
      "Talebeler",
      "Rümeysa Nur Karaca",
      "rumeysa@example.com",
      "Kayıtlı dersler",
      "Emsile ve Bina",
      "Avâmil",
      "tamamladı",
      "1 Eyl 2026",
      "1 talebe",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('href="/kosks/k1/courses/c1/students"');
    expect(html).toContain('href="/kosks/k1/courses/c2/students"');
    // nothing is changed from here, and no application is announced when none waits
    expect(html).not.toContain("Yasakla");
    expect(html).not.toContain("Onay bekleyen");
  });

  it("says how many applications wait, with the way to Başvurular", () => {
    const html = render(
      <KoskStudentsView
        koskId="k1"
        koskName="Köşk"
        q=""
        data={data({ pendingCount: 5 })}
      />
    );
    expect(html).toContain("Onay bekleyen 5 başvuru var.");
    expect(html).toContain('href="/kosks/k1/basvurular"');
  });

  it("searches with a plain form that keeps the word, and words both kinds of empty", () => {
    const searched = render(
      <KoskStudentsView
        koskId="k1"
        koskName="Köşk"
        q="bilal"
        data={data({ items: [], total: 0 })}
      />
    );
    expect(searched).toContain('method="get"');
    expect(searched).toContain('action="/kosks/k1/talebeler"');
    expect(searched).toMatch(/<input[^>]*name="ara"[^>]*value="bilal"/);
    expect(searched).toContain("Bu aramaya uyan talebe yok.");
    expect(
      render(
        <KoskStudentsView
          koskId="k1"
          koskName="Köşk"
          q=""
          data={data({ items: [], total: 0 })}
        />
      )
    ).toContain("Bu köşkün derslerinde henüz talebe yok.");
    expect(
      render(<KoskStudentsView koskId="k1" koskName="Köşk" q="" data={null} />)
    ).toContain("Talebeler okunamadı");
  });
});

describe("köşk geneli Ders kayıtları (MDRS-211)", () => {
  const list = (
    items: KoskRecordingRowResponse[]
  ): KoskRecordingListResponse => ({
    items,
    total: items.length,
    page: 1,
    limit: 20,
  });

  it("groups the recordings by course and week, with source, status and visibility", () => {
    const html = render(
      <KoskRecordingsView
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        data={list([
          recording(),
          recording({
            id: "r2",
            title: "Hafta sonu müzakeresi",
            status: "PROCESSING",
            visibility: "ENROLLED",
            durationMinutes: null,
          }),
          recording({
            id: "r3",
            title: "Sülâsî mücerred: celse kaydı",
            weekNumber: 3,
            weekTitle: "Sülâsî mücerred bâblar",
            provider: "DRIVE",
          }),
          recording({
            id: "r4",
            title: "Avâmil: celse kaydı",
            courseId: "c2",
            courseTitle: "Avâmil",
            weekNumber: 1,
            weekTitle: "Giriş",
            provider: "YOUTUBE",
            status: "FAILED",
          }),
        ])}
      />
    );
    for (const text of [
      "Ders kayıtları",
      "4 ders kaydı",
      "Emsile ve Bina",
      "Hafta 4",
      "Mezîd fiiller ve bâblar",
      "Mezîd fiiller: celse kaydı",
      "Celse: 26 Eyl Cmt 21:00",
      "58 dk",
      "Medaris oynatıcısı",
      "Hazır",
      "Herkese açık",
      "Hazırlanıyor",
      "Yalnız kayıtlı talebeler",
      "Hafta 3",
      "Google Drive",
      "Avâmil",
      "YouTube",
      "Başarısız",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html.match(/data-testid="kosk-recordings-course"/g)).toHaveLength(2);
    expect(html).toContain('href="/kosks/k1/courses/c1/sessions"');
    expect(html).toContain('href="/kosks/k1/courses/c2/sessions"');
    // nothing is added or changed from here
    expect(html).not.toContain("Yeniden adlandır");
  });

  it("says when there is none, and when the read failed", () => {
    expect(
      render(<KoskRecordingsView koskId="k1" koskName="Köşk" data={list([])} />)
    ).toContain("Bu köşkün derslerinde henüz ders kaydı yok.");
    expect(
      render(<KoskRecordingsView koskId="k1" koskName="Köşk" data={null} />)
    ).toContain("Ders kayıtları okunamadı");
  });
});

describe("the rules behind the köşk-wide lists", () => {
  it("reads the address: the tab, the page and the search", () => {
    expect(sessionTabOf("gecmis")).toBe("PAST");
    expect(sessionTabOf("x")).toBe("UPCOMING");
    expect(sessionTabOf(undefined)).toBe("UPCOMING");
    expect(sessionTabOf(["gecmis", "gecmis"])).toBe("UPCOMING");
    expect(pageOf("3")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "abc", undefined, ["2"]]) {
      expect(pageOf(bad)).toBe(1);
    }
    expect(searchOf("  bilal  ")).toBe("bilal");
    expect(searchOf("a".repeat(150))).toHaveLength(100);
    expect(searchOf(["a"])).toBe("");
  });

  it("writes the address back, leaving out what is the default", () => {
    expect(sessionsHref("k1")).toBe("/kosks/k1/celseler");
    expect(sessionsHref("k1", "PAST", 2)).toBe(
      "/kosks/k1/celseler?sekme=gecmis&sayfa=2"
    );
    expect(studentsHref("k1")).toBe("/kosks/k1/talebeler");
    expect(studentsHref("k1", "ali veli", 3)).toBe(
      "/kosks/k1/talebeler?ara=ali+veli&sayfa=3"
    );
    expect(recordingsHref("k1")).toBe("/kosks/k1/ders-kayitlari");
    expect(recordingsHref("k1", 2)).toBe("/kosks/k1/ders-kayitlari?sayfa=2");
  });

  it("knows where a page stands, and leads back from a page past the end", () => {
    expect(pagerOf(1, 20, 45, 20)).toEqual({
      page: 1,
      pages: 3,
      from: 1,
      to: 20,
      prev: null,
      next: 2,
    });
    expect(pagerOf(3, 20, 45, 5)).toMatchObject({
      from: 41,
      to: 45,
      prev: 2,
      next: null,
    });
    expect(pagerOf(9, 20, 45, 0)).toMatchObject({
      from: 0,
      to: 0,
      prev: 3,
      next: null,
    });
    expect(pagerOf(1, 20, 0, 0)).toMatchObject({ pages: 1, prev: null });
  });

  it("words a session's state and tones a recording's", () => {
    expect(sessionState({ cancelled: true }, "UPCOMING")).toBe("cancelled");
    expect(sessionState({ cancelled: true }, "PAST")).toBe("cancelled");
    expect(sessionState({ cancelled: false }, "PAST")).toBe("ended");
    expect(sessionState({ cancelled: false }, "UPCOMING")).toBe("scheduled");
    expect(recordingVariant("READY")).toBe("success");
    expect(recordingVariant("FAILED")).toBe("error");
    expect(recordingVariant("PROCESSING")).toBe("warning");
  });

  it("groups a page of recordings in the order it came", () => {
    const groups = groupRecordings([
      recording({ id: "a" }),
      recording({ id: "b", weekNumber: 3 }),
      recording({ id: "c", courseId: "c2", courseTitle: "Avâmil" }),
      recording({ id: "d" }),
    ]);
    expect(
      groups.map((c) => [
        c.courseTitle,
        c.weeks.map((w) => [w.weekNumber, w.items.map((i) => i.id)]),
      ])
    ).toEqual([
      [
        "Emsile ve Bina",
        [
          [4, ["a", "d"]],
          [3, ["b"]],
        ],
      ],
      ["Avâmil", [[4, ["c"]]]],
    ]);
  });

  it("has the same keys in tr, en and ar", () => {
    const keys = (o: unknown, at = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${at}${k}.`) : [`${at}${k}`]
      );
    const tr = keys(resources.tr.nizam.KoskLists);
    expect(keys(resources.en.nizam.KoskLists)).toEqual(tr);
    expect(keys(resources.ar.nizam.KoskLists)).toEqual(tr);
  });
});
