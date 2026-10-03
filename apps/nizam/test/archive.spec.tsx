import { resources } from "@medaris/i18n";
import type { ArchiveItemResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArchiveView } from "~/features/archive/components/archive-view";
import {
  actionName,
  archiverLine,
  contextParts,
  hasMore,
  hiddenAtLabel,
  impactLines,
  type Messages,
  scopeQuery,
  sessionWhen,
  shownLabel,
} from "~/features/archive/present";

// The server actions reach for the session and the API; none runs in a render.
vi.mock("~/features/archive/actions", () => ({
  loadArchive: vi.fn(),
  restoreArchiveItem: vi.fn(),
  loadArchiveImpact: vi.fn(),
  deleteArchiveItem: vi.fn(),
}));

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);

const messages = resources.tr.nizam as unknown as Record<string, unknown>;
const t: Messages = (key, values) =>
  Object.entries(values ?? {}).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    String(dig(messages.ArchivePage, key))
  );

const base = {
  koskId: "k1",
  koskName: "Nûruosmaniye Köşkü",
  madrasahId: null,
  madrasahName: null,
  courseId: null,
  courseTitle: null,
  weekNumber: null,
  scheduledAt: null,
  weekCount: null,
  sessionCount: null,
  studentCount: null,
  archivedAt: new Date("2026-10-01T15:20:00Z"),
  archivedBy: {
    id: "u1",
    name: "Abdülhamit Karaosmanoğlu",
    role: "KOSK_NAZIM",
  },
};

const item = (over: Partial<ArchiveItemResponse>): ArchiveItemResponse =>
  ({
    type: "course",
    id: "i1",
    title: "Maksûd okumaları",
    ...base,
    ...over,
  }) as ArchiveItemResponse;

const OPTS = { locale: "tr", timeZone: "Europe/Istanbul" };
const when = (at: Date) => sessionWhen(at, OPTS);

describe("hiddenAtLabel (nizam 28: Gizlendiği tarih)", () => {
  const now = new Date("2026-10-02T09:00:00Z");

  it("says Dün for yesterday and Bugün for today, at the viewer's clock", () => {
    expect(
      hiddenAtLabel(new Date("2026-10-01T15:20:00Z"), now, { ...OPTS, t })
    ).toBe("Dün 18:20");
    expect(
      hiddenAtLabel(new Date("2026-10-02T06:05:00Z"), now, { ...OPTS, t })
    ).toBe("Bugün 09:05");
  });

  it("gives the date for anything older", () => {
    expect(
      hiddenAtLabel(new Date("2026-09-29T11:05:00Z"), now, { ...OPTS, t })
    ).toBe("29 Eyl 14:05");
  });

  it("follows the viewer's zone across midnight", () => {
    // 21:30 UTC on 1 Oct is already 2 Oct 00:30 in Istanbul.
    expect(
      hiddenAtLabel(new Date("2026-10-01T21:30:00Z"), now, { ...OPTS, t })
    ).toBe("Bugün 00:30");
  });
});

describe("contextParts (the line under a hidden title)", () => {
  it("reads a session as week, course and time", () => {
    expect(
      contextParts(
        item({
          type: "session",
          weekNumber: 5,
          courseTitle: "Emsile ve Bina",
          scheduledAt: new Date("2026-10-03T18:00:00Z"),
        }),
        t,
        when
      )
    ).toEqual(["Hafta 5", "Emsile ve Bina", "3 Eki Cmt 21:00"]);
  });

  it("reads a week with its session count, and leaves a zero out", () => {
    expect(
      contextParts(
        item({
          type: "week",
          weekNumber: 9,
          sessionCount: 2,
          courseTitle: "Emsile ve Bina",
        }),
        t,
        when
      )
    ).toEqual(["Hafta 9", "2 celse", "Emsile ve Bina"]);
    expect(
      contextParts(
        item({
          type: "week",
          weekNumber: 11,
          sessionCount: 0,
          courseTitle: "Avâmil ve Tasrîf",
        }),
        t,
        when
      )
    ).toEqual(["Hafta 11", "Avâmil ve Tasrîf"]);
  });

  it("reads a course as weeks and talebe, then its medrese", () => {
    expect(
      contextParts(
        item({
          type: "course",
          weekCount: 12,
          studentCount: 14,
          madrasahName: "Süleymaniye Medresesi",
        }),
        t,
        when
      )
    ).toEqual(["12 hafta", "14 talebe", "Süleymaniye Medresesi"]);
  });

  it("has nothing to add for a deck", () => {
    expect(contextParts(item({ type: "deck" }), t, when)).toEqual([]);
  });
});

describe("actionName (the button's accessible name)", () => {
  it("names the item and where it sits", () => {
    const row = item({ type: "session", title: "Telafi celsesi: altı bâb" });
    expect(
      actionName("restoreLabel", row, t, ["Hafta 2", "Bina ve İzhar Şerhi"])
    ).toBe("Geri al: Telafi celsesi: altı bâb, Hafta 2 · Bina ve İzhar Şerhi");
    expect(actionName("permanentDeleteLabel", item({}), t, [])).toBe(
      "Kalıcı olarak sil: Maksûd okumaları"
    );
  });
});

describe("archiverLine", () => {
  it("prints the name and the role the hider held", () => {
    expect(archiverLine(item({}), t)).toEqual({
      name: "Abdülhamit Karaosmanoğlu",
      role: "Köşk nazımı",
    });
  });

  it("falls back for a hider with no name or none on record", () => {
    expect(archiverLine(item({ archivedBy: null }), t)).toEqual({
      name: "Bilinmiyor",
      role: null,
    });
    expect(
      archiverLine(item({ archivedBy: { id: "u", name: null, role: null } }), t)
    ).toEqual({ name: "Bilinmiyor", role: null });
  });
});

describe("impactLines (nizam 29: what a permanent delete takes)", () => {
  it("lists the course delete the way the design words it", () => {
    const lines = impactLines(
      {
        type: "course",
        courses: 0,
        weeks: 12,
        students: 35,
        sessions: 12,
        recordings: 2,
        followers: 0,
        cards: 0,
      },
      t
    ).map((l) => l.text);
    expect(lines).toEqual([
      "Ders sayfası, tanıtımı ve 12 haftalık müfredatı",
      "35 talebe kaydı ve talebelerin bu dersteki ilerlemesi",
      "12 celse, celse akışları ve toplantı bağlantıları",
      "2 ders kaydı",
    ]);
  });

  it("leaves out what is zero", () => {
    const lines = impactLines(
      {
        type: "session",
        courses: 0,
        weeks: 0,
        students: 0,
        sessions: 1,
        recordings: 0,
        followers: 0,
        cards: 0,
      },
      t
    );
    expect(lines.map((l) => l.key)).toEqual(["sessions"]);
  });

  it("counts a köşk's courses and followers and a deck's cards", () => {
    expect(
      impactLines(
        {
          type: "kosk",
          courses: 3,
          weeks: 20,
          students: 9,
          sessions: 40,
          recordings: 0,
          followers: 7,
          cards: 0,
        },
        t
      ).map((l) => l.key)
    ).toEqual(["courses", "weeks", "students", "sessions", "followers"]);
    expect(
      impactLines(
        {
          type: "deck",
          courses: 0,
          weeks: 0,
          students: 0,
          sessions: 0,
          recordings: 0,
          followers: 0,
          cards: 30,
        },
        t
      ).map((l) => l.text)
    ).toEqual(["30 kart ve kartlardaki ilerleme"]);
  });
});

describe("paging state ('Daha fazla göster')", () => {
  it("offers more only while something is left", () => {
    expect(hasMore(10, 18)).toBe(true);
    expect(hasMore(18, 18)).toBe(false);
    expect(hasMore(0, 0)).toBe(false);
  });

  it("words how much is shown", () => {
    expect(shownLabel(10, 18, t)).toBe("Toplam 18 öğe, 10 tanesi gösteriliyor");
  });
});

describe("scopeQuery", () => {
  it("maps the scope select to the API's filter", () => {
    expect(scopeQuery("all")).toEqual({});
    expect(scopeQuery("kosk:abc")).toEqual({ koskId: "abc" });
    expect(scopeQuery("madrasah:xyz")).toEqual({ madrasahId: "xyz" });
  });
});

const render = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nizam: resources.tr.nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const rows: ArchiveItemResponse[] = [
  item({
    id: "a",
    type: "session",
    title: "Mehmûz fiiller (mükerrer)",
    weekNumber: 5,
    courseTitle: "Emsile ve Bina",
  }),
  item({
    id: "b",
    type: "course",
    title: "Maksûd okumaları",
    weekCount: 8,
    studentCount: 19,
  }),
];

describe("ArchiveView — the köşk archive (nizam 28)", () => {
  const html = render(
    <ArchiveView
      mode={{ kind: "kosk", koskId: "k1", koskName: "Nûruosmaniye Köşkü" }}
      initial={{ items: rows, total: 10, page: 1, limit: 50 }}
      pageSize={50}
    />
  );

  it("lists each hidden item with a 'Geri al' named after it", () => {
    expect(html).toContain("Mehmûz fiiller (mükerrer)");
    expect(html).toContain(
      "Geri al: Mehmûz fiiller (mükerrer), Hafta 5 · Emsile ve Bina"
    );
    expect(html).toContain("Geri al: Maksûd okumaları, 8 hafta · 19 talebe");
  });

  it("counts the hidden items, not the rows on the page", () => {
    expect(html).toContain("10 gizli öğe");
  });

  it("has no permanent delete (criterion 4)", () => {
    expect(html).not.toContain("Kalıcı olarak sil");
  });

  it("names the filters", () => {
    expect(html).toContain("Tür: tümü");
    expect(html).not.toContain("Kapsam: tümü");
  });
});

describe("ArchiveView — the platform archive (nizam 29)", () => {
  const html = render(
    <ArchiveView
      mode={{ kind: "platform" }}
      initial={{ items: rows, total: 18, page: 1, limit: 10 }}
      scopes={{ kosks: [{ id: "k1", name: "Fatih Köşkü" }], madrasahs: [] }}
      pageSize={10}
    />
  );

  it("offers the permanent delete beside 'Geri al'", () => {
    expect(html).toContain("Kalıcı olarak sil: Maksûd okumaları");
    expect(html).toContain("Geri al: Maksûd okumaları");
  });

  it("says how many of the total show and offers more", () => {
    expect(html).toContain("Toplam 18 öğe, 2 tanesi gösteriliyor");
    expect(html).toContain("Daha fazla göster");
    expect(html).toContain("Kapsam: tümü");
  });

  it("shows the error state with a retry when the first read failed", () => {
    const failed = render(
      <ArchiveView mode={{ kind: "platform" }} initial={null} pageSize={10} />
    );
    expect(failed).toContain("Arşiv yüklenemedi");
    expect(failed).toContain("Yeniden dene");
  });

  it("shows the empty state", () => {
    const empty = render(
      <ArchiveView
        mode={{ kind: "platform" }}
        initial={{ items: [], total: 0, page: 1, limit: 10 }}
        pageSize={10}
      />
    );
    expect(empty).toContain("Gizlenen öğe yok");
    expect(empty).not.toContain("Daha fazla göster");
  });
});
