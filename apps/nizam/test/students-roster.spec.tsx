import { resources } from "@medaris/i18n";
import type {
  RemovedEnrollmentResponse,
  RosterEnrollmentResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RemovedTable } from "~/features/applications/components/removed-table";
import { RosterTable } from "~/features/applications/components/roster-table";
import {
  filterRoster,
  ROSTER_PAGE,
  sortRoster,
  studentActions,
} from "~/features/applications/present";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
// The server actions reach for the session and the API; none runs in a render.
vi.mock("~/features/kosks/actions/courses", () => ({
  setEnrollmentStatus: vi.fn(),
  removeEnrollment: vi.fn(),
}));
vi.mock("~/features/bans/actions", () => ({
  createBan: vi.fn(),
  liftBan: vi.fn(),
}));

const enrolled = (
  over: Partial<RosterEnrollmentResponse> = {}
): RosterEnrollmentResponse =>
  ({
    userId: "u1",
    courseId: "c1",
    studentName: "Bilal Hamza Yurtsever",
    studentEmail: "bilal.yurtsever@example.com",
    progress: 45,
    status: "ENROLLED",
    createdAt: new Date("2026-09-20T08:00:00Z"),
    updatedAt: new Date("2026-09-20T08:00:00Z"),
    ban: null,
    ...over,
  }) as RosterEnrollmentResponse;

describe("filterRoster (nizam 58: Arama ad/e-posta süzgeci)", () => {
  const people = [
    enrolled({ userId: "a", studentName: "Rümeysa Nur Karaca" }),
    enrolled({
      userId: "b",
      studentName: "Ismail Işık",
      studentEmail: "ismail@example.com",
    }),
    enrolled({ userId: "c", studentName: null, studentEmail: "x@example.com" }),
  ];

  it("keeps everyone for an empty search", () => {
    expect(filterRoster(people, "  ")).toHaveLength(3);
  });

  it("matches the name, Turkish letters folded, and the address", () => {
    expect(filterRoster(people, "rumeysa").map((p) => p.userId)).toEqual(["a"]);
    expect(filterRoster(people, "ISIK").map((p) => p.userId)).toEqual(["b"]);
    expect(filterRoster(people, "x@example").map((p) => p.userId)).toEqual([
      "c",
    ]);
    expect(filterRoster(people, "nobody")).toEqual([]);
  });
});

describe("sortRoster (the Talebe column)", () => {
  const people = [
    enrolled({ userId: "z", studentName: "Zeynep" }),
    enrolled({ userId: "n", studentName: null }),
    enrolled({ userId: "a", studentName: "Abdullah" }),
  ];

  it("sorts by name, the nameless last in both directions", () => {
    expect(sortRoster(people, "ascending").map((p) => p.userId)).toEqual([
      "a",
      "z",
      "n",
    ]);
    expect(sortRoster(people, "descending").map((p) => p.userId)).toEqual([
      "z",
      "a",
      "n",
    ]);
  });
});

describe("studentActions (nizam 58: the buttons of a row)", () => {
  it("offers complete, remove and bar to a held seat", () => {
    expect(studentActions("ENROLLED", false)).toEqual([
      "complete",
      "remove",
      "ban",
    ]);
  });

  it("swaps the bar for the lift, and drops removal, for a barred talebe", () => {
    expect(studentActions("ENROLLED", true)).toEqual(["complete", "lift"]);
  });

  it("offers a completion reopening, and nothing to a request", () => {
    expect(studentActions("COMPLETED", false)).toEqual(["reopen", "ban"]);
    expect(studentActions("PENDING", false)).toEqual([]);
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

describe("RosterTable (nizam 58)", () => {
  const table = (list: RosterEnrollmentResponse[], variant = "enrolled") =>
    render(
      <RosterTable
        variant={variant as "enrolled"}
        koskId="k1"
        koskName="Nûruosmaniye Köşkü"
        courseId="c1"
        courseTitle="Emsile ve Bina"
        list={list}
        mayBanKosk
        nextSessionAt={null}
        empty="Kayıtlı talebe yok"
      />
    );
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      enrolled({
        userId: `u${i}`,
        studentName: `Talebe ${String(i).padStart(2, "0")}`,
        studentEmail: `t${i}@example.com`,
        progress: i * 10,
      })
    );

  it("shows six rows of a long list, the total and 'Daha fazla göster'", () => {
    const html = table(many(28));
    expect(html.match(/Tamamladı say: /g)).toHaveLength(ROSTER_PAGE);
    expect(html).toContain("28 talebeden 6 tanesi gösteriliyor");
    expect(html).toContain("Daha fazla göster");
  });

  it("shows everything of a short list with no 'Daha fazla göster'", () => {
    const html = table(many(3));
    expect(html).toContain("3 talebeden 3 tanesi gösteriliyor");
    expect(html).not.toContain("Daha fazla göster");
  });

  it("draws the search, the help sentence and the talebe's own progress", () => {
    const html = table(many(2));
    expect(html).toContain("Ada ya da e-postaya göre ara");
    expect(html).toContain(
      "İlerlemeyi talebe kendisi girer; dersi tamamladığını ders kadrosu onaylar."
    );
    expect(html).toContain("Talebenin girdiği ilerleme: Talebe 01");
    expect(html).toContain('aria-valuenow="10"');
  });

  it("offers Tamamladı say, Dersten çıkar and Yasakla on a held seat", () => {
    const html = table([enrolled()]);
    expect(html).toContain("Tamamladı say: Bilal Hamza Yurtsever");
    expect(html).toContain("Dersten çıkar: Bilal Hamza Yurtsever");
    expect(html).toContain("Yasakla: Bilal Hamza Yurtsever");
  });

  it("marks a barred talebe and offers the lift instead of the removal", () => {
    const html = table([enrolled({ ban: { id: "b1", scope: "COURSE" } })]);
    expect(html).toContain("Yasaklı · Bu ders");
    expect(html).toContain("Yasağı kaldır: Bilal Hamza Yurtsever");
    expect(html).not.toContain("Dersten çıkar: ");
  });

  it("offers the reopening on the completed tab, with no help sentence", () => {
    const html = table(
      [enrolled({ status: "COMPLETED", progress: 100 })],
      "completed"
    );
    expect(html).toContain("Yeniden aç: Bilal Hamza Yurtsever");
    expect(html).not.toContain("İlerlemeyi talebe kendisi girer");
  });

  it("shows the empty sentence of an empty list", () => {
    expect(table([])).toContain("Kayıtlı talebe yok");
  });
});

describe("RemovedTable (nizam 58: Erişimi kaldırılanlar)", () => {
  const removed = (
    over: Partial<RemovedEnrollmentResponse> = {}
  ): RemovedEnrollmentResponse => ({
    userId: "u1",
    name: "Bilal Hamza Yurtsever",
    email: "bilal.yurtsever@example.com",
    reason: "Dört celsedir haber vermeden katılmıyor.",
    progress: 40,
    removedAt: new Date("2026-10-01T09:30:00Z"),
    removedBy: { id: "m1", name: "Abdülhamit Karaosmanoğlu" },
    ...over,
  });

  it("lists who was taken out with the reason and who wrote it", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="tr"
        timeZone="Europe/Istanbul"
        messages={{ nizam: resources.tr.nizam } as never}
      >
        <RemovedTable list={[removed()]} courseTitle="Emsile ve Bina" />
      </NextIntlClientProvider>
    );
    expect(html).toContain("Bilal Hamza Yurtsever");
    expect(html).toContain("Dört celsedir haber vermeden katılmıyor.");
    expect(html).toContain("Abdülhamit Karaosmanoğlu");
    expect(html).toContain("Çıkaran");
  });

  it("says so when no one was taken out", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="tr"
        timeZone="Europe/Istanbul"
        messages={{ nizam: resources.tr.nizam } as never}
      >
        <RemovedTable list={[]} courseTitle="Emsile ve Bina" />
      </NextIntlClientProvider>
    );
    expect(html).toContain("Erişimi kaldırılan talebe yok");
  });
});

describe("the tr, en and ar strings of nizam 58", () => {
  const sets = {
    tr: resources.tr.nizam,
    en: resources.en.nizam,
    ar: resources.ar.nizam,
  } as unknown as Record<"tr" | "en" | "ar", Record<string, unknown>>;
  const flat = (o: unknown, prefix = ""): string[] =>
    o && typeof o === "object"
      ? Object.entries(o).flatMap(([k, v]) => flat(v, `${prefix}${k}.`))
      : [prefix.slice(0, -1)];

  it.each([
    "StudentsPage",
    "StudentsRoster",
    "RemoveDialog",
  ])("%s has the same keys in all three languages", (name) => {
    const tr = flat(sets.tr[name]).sort();
    expect(tr.length).toBeGreaterThan(5);
    expect(flat(sets.en[name]).sort()).toEqual(tr);
    expect(flat(sets.ar[name]).sort()).toEqual(tr);
  });

  it("names the talebe in bold in the removal sentence", () => {
    expect(
      String((sets.tr.RemoveDialog as Record<string, string>).body)
    ).toContain("<b>{name}</b> adlı talebe {course} dersinden çıkarılacak.");
  });
});
