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
  me: { timeZone: "Europe/Istanbul" } as { timeZone?: string } | null,
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
  readOnce: async () => state.nazirs,
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
        role: "MEDRESE_BASMUDERRIS",
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
      messages={{ nazir: resources.tr.nazir }}
    >
      <ToastProvider>
        <NazirsPage madrasahId="m-1" />
      </ToastProvider>
    </NextIntlClientProvider>
  );
};

beforeEach(() => {
  state.nazirs = { status: "ok", data: roster };
  state.me = { timeZone: "Europe/Istanbul" };
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
    const table = markup.slice(markup.indexOf('data-testid="nazirs"'));
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
    expect(rows[2]).toMatch(/Eylül 2026 — — Görevden al/);
  });

  it("draws 'Görevden al' on every row, off until the gate has been read on the viewer's clock", async () => {
    const markup = await render();
    for (const name of roster.map((n) => n.user.name)) {
      expect(markup).toMatch(
        new RegExp(
          `<button[^>]*disabled[^>]*aria-label="Görevden al: ${name}"[^>]*>Görevden al</button>`
        )
      );
    }
  });

  it("does not draw the permission editor or the groups of the next package", async () => {
    const text = textOf(await render());
    for (const word of [
      "İzinleri düzenle",
      "İzin ver",
      "İzin grupları",
      "Grup tanımla",
    ]) {
      expect(text, word).not.toContain(word);
    }
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
