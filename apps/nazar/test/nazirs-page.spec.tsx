import { resources } from "@medaris/i18n";
import { ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { html, textOf, translatorFor } from "./server-render";

/**
 * Medrese nazırları (nazir 05) as the server renders it. The roster and the
 * portal are stubbed; what is under test is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  nazirs: { status: "failed" } as Answer<unknown[]>,
  groups: { status: "ok", data: [] } as Answer<unknown[]>,
  me: { timeZone: "Europe/Istanbul" } as {
    id?: string;
    timeZone?: string;
  } | null,
  role: "MEDRESE_BASMUDERRIS",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string) =>
    what.includes("permission groups") ? state.groups : state.nazirs,
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.me,
}));
vi.mock("~/features/shell/reads", () => ({
  getPortal: async () => ({
    status: "ok",
    scopes: [
      {
        kind: "medrese",
        id: "m-1",
        name: "Süleymaniye Medresesi",
        role: state.role,
        isImam: false,
        koskName: null,
      },
    ],
  }),
}));
vi.mock("~/features/nazirs/actions", () => ({
  lookupPerson: vi.fn(),
  appointNazir: vi.fn(),
  getNazirGrants: vi.fn(),
  dismissNazir: vi.fn(),
  loadEditor: vi.fn(),
  saveNazirPermissions: vi.fn(),
  loadCatalog: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  removeGroup: vi.fn(),
}));

const person = (name: string, email: string, id: string) => ({
  id,
  name,
  email,
});
const giver = person("Mehmet Emin Işıkoğlu", "me@example.com", "u-0");

/** The three nazırs of the canvas: groups and extras, one group, nothing yet. */
const roster = [
  {
    user: person("Fatma Zehra Çelebioğlu", "fz.celebioglu@example.com", "u-1"),
    appointedBy: giver,
    appointedAt: new Date("2026-09-12T09:00:00Z"),
    assignmentExpiresAt: null,
    expiresAt: null,
    groups: [
      { id: "g-1", name: "Ders açma ve kadro", permissions: [] },
      { id: "g-2", name: "Yasak ve itiraz", permissions: [] },
    ],
    courseGrants: [],
    permissions: [
      { code: "course.edit", grantedAt: new Date("2026-09-12T09:00:00Z") },
      { code: "week.hide", grantedAt: new Date("2026-09-12T09:00:00Z") },
      { code: "course.publish", grantedAt: new Date("2026-09-12T09:00:00Z") },
    ],
    grantedBy: giver,
    grantedAt: new Date("2026-09-12T09:00:00Z"),
  },
  {
    user: person(
      "Ümmügülsüm Nur Hacıosmanoğlu",
      "u.haciosmanoglu@example.com",
      "u-2"
    ),
    appointedBy: giver,
    appointedAt: new Date("2026-09-20T09:00:00Z"),
    assignmentExpiresAt: null,
    expiresAt: new Date("2026-12-31T20:59:59Z"),
    groups: [{ id: "g-3", name: "Kayıt ve talebe işleri", permissions: [] }],
    permissions: [],
    courseGrants: [],
    grantedBy: giver,
    grantedAt: new Date("2026-09-20T09:00:00Z"),
  },
  {
    user: person(
      "Abdullah Talha Erzurumluoğlu",
      "a.erzurumluoglu@example.com",
      "u-3"
    ),
    appointedBy: person("Fatma Zehra Çelebioğlu", "fz@example.com", "u-1"),
    appointedAt: new Date("2026-09-30T09:00:00Z"),
    assignmentExpiresAt: null,
    expiresAt: null,
    groups: [],
    permissions: [],
    courseGrants: [],
    grantedBy: null,
    grantedAt: null,
  },
];

const render = async () => {
  const { NazirsPage } = await import(
    "~/features/nazirs/components/nazirs-page"
  );
  return html(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <NazirsPage madrasahId="m-1" />
      </ToastProvider>
    </NextIntlClientProvider>
  );
};

/** The three groups of the canvas, as `GET /madrasahs/:id/permission-groups` sends them. */
const canvasGroups = [
  {
    id: "g-1",
    name: "Ders açma ve kadro",
    scope: "MADRASAH",
    permissions: ["madrasah.course_open", "madrasah.muderris_manage"],
    userCount: 1,
  },
  {
    id: "g-3",
    name: "Kayıt ve talebe işleri",
    scope: "MADRASAH",
    permissions: [
      "madrasah.students_view",
      "enrollment.decide",
      "enrollment.remove",
      "session.view_content",
    ],
    userCount: 1,
  },
  {
    id: "g-2",
    name: "Yasak ve itiraz",
    scope: "COURSE",
    permissions: ["ban.course", "ban.lift_course", "madrasah.appeal_open"],
    userCount: 0,
  },
];

beforeEach(() => {
  state.groups = { status: "ok", data: canvasGroups };
  state.nazirs = { status: "ok", data: roster };
  state.me = { timeZone: "Europe/Istanbul" };
  state.role = "MEDRESE_BASMUDERRIS";
});

describe("Medrese nazırları", () => {
  it("is headed with its sentence and offers 'Medrese nazırı ata'", async () => {
    const markup = await render();
    expect(markup).toMatch(/<h1[^>]*>Medrese nazırları<\/h1>/);
    const text = textOf(markup);
    expect(text).toContain(
      "Medrese nazırları yalnız sizin ya da izinli bir Medaris nazımının verdiği izinlerle çalışır ve aldıkları izni başkasına veremez."
    );
    expect(text).toContain("Medrese nazırı ata");
  });

  it("names the nazır who holds nothing yet, who appointed them and when (criterion 3)", async () => {
    const text = textOf(await render());
    expect(text).toContain("Abdullah Talha Erzurumluoğlu henüz izin almadı");
    expect(text).toContain(
      "Fatma Zehra Çelebioğlu 30 Eylül’de atadı. Siz izin verene kadar hiçbir işlem yapamaz."
    );
  });

  it("has no band when everyone holds something", async () => {
    state.nazirs = { status: "ok", data: roster.slice(0, 2) };
    expect(textOf(await render())).not.toContain("henüz izin almadı");
  });

  it("lists the nazırs with their groups, extra permissions, end and giver (criterion 1)", async () => {
    const markup = await render();
    const table = markup.slice(
      markup.indexOf('data-testid="nazirs"'),
      markup.indexOf('data-testid="permission-groups"')
    );
    const rows = table.split("<tr").slice(2).map(textOf);
    expect(rows).toHaveLength(3);

    expect(rows[0]).toContain("Fatma Zehra Çelebioğlu");
    expect(rows[0]).toContain("fz.celebioglu@example.com");
    expect(rows[0]).toContain("Ders açma ve kadro Yasak ve itiraz");
    expect(rows[0]).toMatch(/Ayrıca 3 izin: Dersi düzenle/);
    expect(rows[0]).toContain("Süresiz");
    expect(rows[0]).toContain("Mehmet Emin Işıkoğlu 12 Eylül 2026");

    expect(rows[1]).toContain("Kayıt ve talebe işleri");
    expect(rows[1]).not.toContain("Ayrıca");
    expect(rows[1]).toContain("31 Aralık 2026");
    expect(rows[1]).toContain("Mehmet Emin Işıkoğlu 20 Eylül 2026");

    expect(rows[2]).toContain("İzin yok");
    expect(rows[2]).toContain("Atayan: Fatma Zehra Çelebioğlu · 30 Eylül 2026");
    // Bitiş and Veren are dashes
    expect(rows[2]).toMatch(/Eylül 2026 — — İzin ver Görevden al/);
  });

  it("draws 'Görevden al' on every row, on from the start (MDRS-215: no version gate)", async () => {
    const markup = await render();
    for (const name of roster.map((n) => n.user.name)) {
      const button = markup.match(
        new RegExp(`<button[^>]*aria-label="Görevden al: ${name}"[^>]*>`)
      )?.[0];
      expect(button, name).toBeDefined();
      expect(button, name).not.toMatch(/disabled/);
    }
  });

  it("offers 'İzinleri düzenle' on a nazır who holds something and 'İzin ver' on one who holds nothing, on from the start (criterion 2, MDRS-215)", async () => {
    const markup = await render();
    for (const label of [
      "İzinleri düzenle: Fatma Zehra Çelebioğlu",
      "İzinleri düzenle: Ümmügülsüm Nur Hacıosmanoğlu",
      "İzin ver: Abdullah Talha Erzurumluoğlu",
    ]) {
      const button = markup.match(
        new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`)
      )?.[0];
      expect(button, label).toBeDefined();
      expect(button, label).not.toMatch(/disabled/);
    }
  });

  it("draws for a nazır let in by 'Medrese nazırı ata' only what the API lets them do: appoint, and dismiss whom they seated (MDRS-108, d-1004-28)", async () => {
    state.role = "MEDRESE_NAZIR";
    state.me = { id: "U-1", timeZone: "Europe/Istanbul" };
    const markup = await render();
    const text = textOf(markup);
    expect(text).toContain("Medrese nazırı ata");
    // Abdullah was seated by Fatma, the viewer; the other two by the başmüderris.
    expect(markup).toMatch(
      /aria-label="Görevden al: Abdullah Talha Erzurumluoğlu"/
    );
    expect(markup).not.toMatch(/aria-label="Görevden al: Fatma Zehra/);
    expect(markup).not.toMatch(/aria-label="Görevden al: Ümmügülsüm/);
    // A medrese nazırı gives nothing: no permission editor, no group buttons.
    expect(markup).not.toMatch(/aria-label="İzinleri düzenle: /);
    expect(markup).not.toMatch(/aria-label="İzin ver: /);
    expect(text).not.toContain("Grup tanımla");
    expect(markup).not.toMatch(/aria-label="Düzenle: /);
    // The groups are still listed.
    expect(text).toContain("Kayıt ve talebe işleri");
  });

  it("lists the medrese's groups under the table as cards: name, permissions, and 'N izin · M nazıra verildi' (criterion 5 of nazir 16)", async () => {
    const markup = await render();
    const section = markup.slice(
      markup.indexOf('data-testid="permission-groups"')
    );
    const text = textOf(section);
    expect(text).toContain("İzin grupları");
    expect(text).toContain(
      "Gruplar yalnız bu medresede ve medrese derslerinde geçerlidir."
    );
    expect(text).toContain("Grup tanımla");

    const cards = section
      .split('data-testid="permission-group"')
      .slice(1)
      .map(textOf);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toContain("Ders açma ve kadro");
    expect(cards[0]).toContain(
      "Medrese dersi aç · Müderris ekle ya da çıkar; imamı değiştir"
    );
    expect(cards[0]).toContain("2 izin · 1 nazıra verildi");
    // more than four permissions are summed up, not all printed
    expect(cards[1]).toContain("4 izin · 1 nazıra verildi");
    expect(cards[2]).toContain("3 izin · 0 nazıra verildi");
    expect(cards[2]).toContain("Köşk kararına itiraz aç");
    expect(markup).toMatch(/aria-label="Düzenle: Yasak ve itiraz"/);
  });

  it("says so when the medrese has no group yet, and still offers 'Grup tanımla'", async () => {
    state.groups = { status: "ok", data: [] };
    const text = textOf(await render());
    expect(text).toContain("Bu medresenin henüz izin grubu yok.");
    expect(text).toContain("Grup tanımla");
  });

  it("says the groups could not be read without taking the roster away", async () => {
    state.groups = { status: "failed" };
    const text = textOf(await render());
    expect(text).toContain("İzin grupları şu an okunamadı.");
    expect(text).not.toContain("Grup tanımla");
    expect(text).toContain("Fatma Zehra Çelebioğlu");
  });

  it("says so when the medrese has no nazır, and still offers the appointment", async () => {
    state.nazirs = { status: "ok", data: [] };
    const text = textOf(await render());
    expect(text).toContain("Bu medresenin henüz nazırı yok.");
    expect(text).toContain("Medrese nazırı ata");
  });

  it("answers a refusal with a notice, no table and no way to appoint (criterion 5)", async () => {
    state.nazirs = { status: "forbidden" };
    const markup = await render();
    const text = textOf(markup);
    expect(text).toContain("Bu sayfaya izniniz yok");
    expect(text).not.toContain("Medrese nazırı ata");
    expect(text).not.toContain("İzin grupları");
    expect(markup).not.toContain('data-testid="nazirs"');
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.nazirs = { status: "failed" };
    const text = textOf(await render());
    expect(text).toContain("Medrese nazırları okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
    expect(text).not.toContain("Medrese nazırı ata");
  });
});

describe("while the nazırs are read", () => {
  it("draws the table as bars, named for assistive technology", async () => {
    const { NazirsLoading } = await import(
      "~/features/nazirs/components/nazirs-page"
    );
    const markup = await html(<NazirsLoading />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/mds-skeleton/g)?.length).toBeGreaterThan(3);
    expect(textOf(markup)).toBe("Yükleniyor");
  });
});
