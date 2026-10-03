import { resources } from "@medaris/i18n";
import type {
  HeadDelegationResponse,
  MadrasahDirectoryItemResponse,
  MadrasahDirectoryResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MadrasahsView } from "~/features/madrasahs/components/madrasahs-view";
import {
  canOpen,
  cleanHandle,
  dateWithCase,
  directoryPath,
  groupByPerson,
  handleError,
  hostingLabel,
  isEmailLike,
  type Messages,
  madrasahErrorKey,
  nameError,
  openPayload,
  personDecisions,
  personsReady,
  pickedUser,
  STATUS_LOOK,
  searchFromParam,
  sinceLabel,
  statusFromParam,
  termEndedLabel,
} from "~/features/madrasahs/present";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/madrasahs/actions", () => ({
  openMadrasah: vi.fn(),
  restoreMadrasah: vi.fn(),
  setHeadMuderris: vi.fn(),
  lookupUserByEmail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);

const messages = resources.tr.nizam as unknown as Record<string, unknown>;
const t: Messages = (key, values) =>
  Object.entries(values ?? {}).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    String(dig(messages.MadrasahsPage, key))
  );

const zone = { locale: "tr", timeZone: "Europe/Istanbul" };

describe("the status tabs in the URL (nizam 07: ?durum=)", () => {
  it("reads etkin, pasif and gizli, and anything else as Tümü", () => {
    expect(statusFromParam("etkin")).toBe("ACTIVE");
    expect(statusFromParam("PASIF")).toBe("PASSIVE");
    expect(statusFromParam("gizli")).toBe("HIDDEN");
    expect(statusFromParam(undefined)).toBe("ALL");
    expect(statusFromParam("tumu")).toBe("ALL");
    expect(statusFromParam(["gizli", "etkin"])).toBe("HIDDEN");
  });

  it("writes the filter and the search back, and nothing for Tümü", () => {
    expect(directoryPath("ALL")).toBe("/medreseler");
    expect(directoryPath("PASSIVE")).toBe("/medreseler?durum=pasif");
    expect(directoryPath("HIDDEN", "  vefa ")).toBe(
      "/medreseler?durum=gizli&q=vefa"
    );
    expect(directoryPath("ALL", "Süleymaniye Medresesi")).toBe(
      "/medreseler?q=S%C3%BCleymaniye+Medresesi"
    );
  });

  it("cuts a search to what the API takes", () => {
    expect(searchFromParam("  zeyrek ")).toBe("zeyrek");
    expect(searchFromParam(undefined)).toBe("");
    expect(searchFromParam("a".repeat(300))).toHaveLength(100);
  });
});

describe("how a status is drawn (nizam 07: Durum)", () => {
  it("is a plain badge for Etkin, a warning with a lock for Pasif, and text with a crossed eye for Gizli", () => {
    expect(STATUS_LOOK.ACTIVE).toEqual({ badge: "secondary", icon: null });
    expect(STATUS_LOOK.PASSIVE).toEqual({ badge: "warning", icon: "lock" });
    expect(STATUS_LOOK.HIDDEN).toEqual({ badge: null, icon: "eyeOff" });
  });
});

describe("'{tarih}’den beri' (nizam 07)", () => {
  it("takes -den or -dan by the month's vowel, and -de or -da for 'doldu'", () => {
    const at = (iso: string) => new Date(`${iso}T09:00:00Z`);
    expect(dateWithCase(at("2026-09-24"), "ablative", zone)).toBe(
      "24 Eylül’den"
    );
    expect(dateWithCase(at("2026-09-27"), "locative", zone)).toBe(
      "27 Eylül’de"
    );
    expect(dateWithCase(at("2026-04-03"), "ablative", zone)).toBe(
      "3 Nisan’dan"
    );
    expect(dateWithCase(at("2026-04-03"), "locative", zone)).toBe("3 Nisan’da");
    expect(dateWithCase(at("2026-01-12"), "ablative", zone)).toBe(
      "12 Ocak’tan"
    );
    expect(dateWithCase(at("2026-08-30"), "locative", zone)).toBe(
      "30 Ağustos’ta"
    );
    expect(dateWithCase(at("2026-10-05"), "ablative", zone)).toBe("5 Ekim’den");
    expect(dateWithCase(at("2026-11-05"), "locative", zone)).toBe("5 Kasım’da");
  });

  it("is the bare date in other languages", () => {
    expect(
      dateWithCase(new Date("2026-09-24T09:00:00Z"), "ablative", {
        locale: "en",
        timeZone: "Europe/Istanbul",
      })
    ).toBe("September 24");
  });

  it("reads the month in the viewer's zone, not UTC's", () => {
    // 31 Aug 22:30 UTC is already 1 Sep in Istanbul.
    expect(
      dateWithCase(new Date("2026-08-31T22:30:00Z"), "ablative", zone)
    ).toBe("1 Eylül’den");
  });

  it("is the second line of the status and of the unassigned head", () => {
    const opts = { ...zone, t };
    expect(sinceLabel("2026-09-24T09:00:00Z", opts)).toBe("24 Eylül’den beri");
    expect(termEndedLabel("2026-09-27T09:00:00Z", opts)).toBe(
      "Görev süresi 27 Eylül’de doldu"
    );
    expect(sinceLabel(null, opts)).toBeNull();
    expect(termEndedLabel(undefined, opts)).toBeNull();
  });
});

describe("hostingLabel (nizam 07: Barındırma hakkı)", () => {
  it("is 'Yok' with no köşk, the name, or the names joined", () => {
    expect(hostingLabel([], "tr", "Yok")).toBe("Yok");
    expect(hostingLabel([{ name: "Beyazıt Köşkü" }], "tr", "Yok")).toBe(
      "Beyazıt Köşkü"
    );
    expect(
      hostingLabel(
        [{ name: "Nûruosmaniye Köşkü" }, { name: "Fatih Köşkü" }],
        "tr",
        "Yok"
      )
    ).toBe("Nûruosmaniye Köşkü ve Fatih Köşkü");
  });
});

describe("the Medrese aç form (nizam 08, criteria 1 to 3)", () => {
  const ok = {
    name: "Atik Ali Paşa Medresesi",
    handle: "atikalipasa",
    description: "",
    headMuderrisUserId: "u1" as string | null,
  };

  it("needs a name: empty or blank is the first error", () => {
    expect(nameError("")).toBe("nameRequired");
    expect(nameError("   ")).toBe("nameRequired");
    expect(nameError("A")).toBe("nameShort");
    expect(nameError(" Vefa ")).toBeNull();
  });

  it("takes only [a-z0-9-] in the short name, with or without the typed @", () => {
    expect(handleError("")).toBeNull();
    expect(handleError("@atikalipasa")).toBeNull();
    expect(handleError("atik-ali-pasa-2")).toBeNull();
    expect(handleError("Atik")).toBe("handleInvalid");
    expect(handleError("atik ali")).toBe("handleInvalid");
    expect(handleError("atık")).toBe("handleInvalid");
    expect(handleError("-atik")).toBe("handleInvalid");
    expect(handleError("atik-")).toBe("handleInvalid");
    expect(handleError("a")).toBe("handleInvalid");
    expect(handleError("a".repeat(61))).toBe("handleInvalid");
    expect(cleanHandle(" @@vefa ")).toBe("vefa");
  });

  it("keeps the button off until the name, the handle and the başmüderris are right", () => {
    expect(canOpen(ok)).toBe(true);
    expect(canOpen({ ...ok, name: "" })).toBe(false);
    expect(canOpen({ ...ok, handle: "Atik Ali" })).toBe(false);
    expect(canOpen({ ...ok, headMuderrisUserId: null })).toBe(false);
    expect(canOpen({ ...ok, handle: "" })).toBe(true);
  });

  it("sends a trimmed payload and leaves out what is empty", () => {
    expect(
      openPayload({
        ...ok,
        name: "  Atik Ali Paşa Medresesi ",
        handle: "@atikalipasa",
      })
    ).toEqual({
      name: "Atik Ali Paşa Medresesi",
      handle: "atikalipasa",
      headMuderrisUserId: "u1",
    });
    expect(
      openPayload({ ...ok, handle: "", description: " Çemberlitaş’ta. " })
    ).toEqual({
      name: "Atik Ali Paşa Medresesi",
      description: "Çemberlitaş’ta.",
      headMuderrisUserId: "u1",
    });
  });

  it("tells a full e-mail address from a half-typed one", () => {
    expect(isEmailLike("ad.soyad@example.com")).toBe(true);
    expect(isEmailLike(" ad@example.com ")).toBe(true);
    expect(isEmailLike("ad@example")).toBe(false);
    expect(isEmailLike("ad@")).toBe(false);
    expect(isEmailLike("ad soyad@example.com")).toBe(false);
  });

  it("prints a found account by its name, else by its address", () => {
    expect(
      pickedUser({
        id: "u1",
        givenName: "Hüseyin Avni",
        familyName: "Karamustafa",
        email: "h@example.com",
      })
    ).toEqual({
      id: "u1",
      name: "Hüseyin Avni Karamustafa",
      email: "h@example.com",
    });
    expect(pickedUser({ id: "u2", email: "x@example.com" })).toEqual({
      id: "u2",
      name: "x@example.com",
      email: "x@example.com",
    });
  });

  it("maps the API's codes to a message and falls back to the generic one", () => {
    expect(madrasahErrorKey({ code: "MADRASAH_HANDLE_TAKEN" })).toBe(
      "errors.handleTaken"
    );
    expect(madrasahErrorKey({ code: "AUTHZ_FORBIDDEN" })).toBe(
      "errors.forbidden"
    );
    expect(madrasahErrorKey({ code: "WHATEVER" })).toBe("errors.generic");
    expect(madrasahErrorKey(undefined)).toBe("errors.generic");
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

const item = (
  over: Partial<MadrasahDirectoryItemResponse>
): MadrasahDirectoryItemResponse => ({
  id: "m1",
  handle: "suleymaniye",
  name: "Süleymaniye Medresesi",
  coverHue: 215,
  status: "ACTIVE",
  since: null,
  headMuderris: { id: "h1", name: "Mehmet Emin Işıkoğlu" },
  courseCount: 4,
  hostingKosks: [
    { id: "k1", name: "Nûruosmaniye Köşkü" },
    { id: "k2", name: "Fatih Köşkü" },
  ],
  ...over,
});

const directory = (
  items: MadrasahDirectoryItemResponse[],
  over: Partial<MadrasahDirectoryResponse> = {}
): MadrasahDirectoryResponse => ({
  items,
  total: items.length,
  page: 1,
  limit: 50,
  counts: { all: 3, active: 1, passive: 1, hidden: 1 },
  passive: [
    {
      id: "m3",
      name: "Zeyrek Medresesi",
      since: new Date("2026-09-27T09:00:00Z"),
    },
  ],
  ...over,
});

const three = [
  item({}),
  item({
    id: "m2",
    handle: "vefa",
    name: "Vefa Medresesi",
    status: "HIDDEN",
    since: new Date("2026-09-24T09:00:00Z"),
    headMuderris: { id: "h2", name: "Mustafa Râsim Erdemoğlu" },
    courseCount: 0,
    hostingKosks: [],
  }),
  item({
    id: "m3",
    handle: "zeyrek",
    name: "Zeyrek Medresesi",
    status: "PASSIVE",
    since: new Date("2026-09-27T09:00:00Z"),
    headMuderris: null,
    courseCount: 0,
    hostingKosks: [{ id: "k3", name: "Beyazıt Köşkü" }],
  }),
];

describe("MadrasahsView (nizam 07)", () => {
  const view = (
    dir: MadrasahDirectoryResponse | null,
    status: "ALL" | "ACTIVE" | "PASSIVE" | "HIDDEN" = "ALL",
    q = ""
  ) => render(<MadrasahsView directory={dir} status={status} q={q} />);

  it("draws the title, 'Medrese aç', the tabs with the API's counts and a row per medrese", () => {
    const html = view(directory(three));
    expect(html).toContain("Medreseler");
    expect(html).toContain("Medrese aç");
    for (const label of ["Tümü", "Etkin", "Pasif", "Gizli"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/mds-tab__count/g)).toHaveLength(4);
    expect(html).toContain("Süleymaniye Medresesi");
    expect(html).toContain("@suleymaniye");
    expect(html).toContain("Mehmet Emin Işıkoğlu");
    expect(html).toContain("Nûruosmaniye Köşkü ve Fatih Köşkü");
  });

  it("says 'Atanmamış' and offers 'Başmüderris ata' on a passive medrese (criterion 2)", () => {
    const html = view(directory(three));
    expect(html).toContain("Atanmamış");
    expect(html).toContain("Görev süresi 27 Eylül’de doldu");
    expect(html).toContain("Pasif");
    expect(html).toContain("27 Eylül’den beri");
    expect(html).toContain("Başmüderris ata: Zeyrek Medresesi");
  });

  it("offers 'Geri al' on a hidden one and nothing on an active one (criterion 3)", () => {
    const html = view(directory(three));
    expect(html).toContain("Geri al: Vefa Medresesi");
    expect(html).toContain("24 Eylül’den beri");
    expect(html).not.toContain("Geri al: Süleymaniye");
    expect(html).not.toContain("Başmüderris ata: Süleymaniye");
    expect(html.match(/Geri al: /g)).toHaveLength(1);
  });

  it("offers 'Başmüderrisi değiştir' on an active medrese with a başmüderris, with no date gate (nizam/22, MDRS-215)", () => {
    const html = view(directory(three));
    const label = 'aria-label="Başmüderrisi değiştir: Süleymaniye Medresesi"';
    expect(html).toContain(label);
    expect(
      html.slice(html.indexOf(label) - 300, html.indexOf(label))
    ).not.toContain("disabled");
    expect(html).not.toContain("Başmüderrisi değiştir: Zeyrek");
    expect(html).not.toContain("Başmüderrisi değiştir: Vefa");
  });

  it("writes 'Yok' for a medrese with no hosting right (criterion 4)", () => {
    const html = view(directory([three[1] as MadrasahDirectoryItemResponse]));
    expect(html).toContain(">Yok<");
  });

  it("warns about the passive medreses, and only when there are some (criterion 5)", () => {
    const withWarning = view(directory(three));
    expect(withWarning).toContain("Zeyrek Medresesi pasif");
    expect(withWarning).toContain(
      "Başmüderrisin görev süresi 27 Eylül’de doldu."
    );
    expect(withWarning).toContain(
      "bir başmüderris atadığınızda yeniden açılır"
    );
    const without = view(
      directory([three[0] as MadrasahDirectoryItemResponse], {
        passive: [],
        counts: { all: 1, active: 1, passive: 0, hidden: 0 },
      })
    );
    expect(without).not.toContain("passive-warning");
    expect(without).not.toContain("pasif</p>");
  });

  it("names several passive medreses once instead of repeating a warning", () => {
    const html = view(
      directory(three, {
        passive: [
          {
            id: "a",
            name: "Zeyrek Medresesi",
            since: new Date("2026-09-27T09:00:00Z"),
          },
          {
            id: "b",
            name: "Vefa Medresesi",
            since: new Date("2026-09-20T09:00:00Z"),
          },
        ],
      })
    );
    expect(html).toContain("2 medrese pasif");
    expect(html).toContain("Zeyrek Medresesi ve Vefa Medresesi.");
  });

  it("links the Arşiv and ends with the footnote about hiding", () => {
    const html = view(directory(three));
    expect(html).toContain('href="/tr/arsiv"');
    expect(html).toContain("Gizlenen medrese, dersleriyle birlikte");
  });

  it("says what is empty: no medrese at all, a search with no hit, a status with none", () => {
    expect(
      view(
        directory([], {
          counts: { all: 0, active: 0, passive: 0, hidden: 0 },
          passive: [],
        })
      )
    ).toContain("Henüz medrese yok.");
    expect(view(directory([]), "ALL", "xyz")).toContain(
      "Aramaya uyan medrese yok."
    );
    expect(view(directory([]), "HIDDEN")).toContain("Bu durumda medrese yok.");
  });

  it("shows the error state with 'Yeniden dene' when the read failed", () => {
    const html = view(null);
    expect(html).toContain("Medreseler yüklenemedi");
    expect(html).toContain("Yeniden dene");
    expect(html).not.toContain("<table");
  });

  it("says how many are shown when the page holds fewer than the total", () => {
    const html = view(directory(three, { total: 120 }));
    expect(html).toContain("Toplam 120 medrese, 3 tanesi gösteriliyor");
  });

  it("keeps the search term in the field", () => {
    expect(view(directory(three), "ALL", "zeyrek")).toContain('value="zeyrek"');
  });
});

describe("the hand-ons of a replaced başmüderris (nizam 22)", () => {
  const item = (
    id: string,
    to: string,
    kind: "ROLE" | "GRANT" = "GRANT"
  ): HeadDelegationResponse =>
    ({
      kind,
      id,
      to: { id: to, name: to, email: null },
      grantedAt: new Date("2026-09-12T00:00:00Z"),
    }) as HeadDelegationResponse;
  const items = [
    item("r1", "fatma", "ROLE"),
    item("g1", "fatma"),
    item("g2", "ummu"),
    item("p1", "fatma"),
  ];

  it("gathers the items by person, in order of first appearance", () => {
    const people = groupByPerson(items);
    expect(people.map((p) => p.person.id)).toEqual(["fatma", "ummu"]);
    expect(people[0]?.items.map((i) => i.id)).toEqual(["r1", "g1", "p1"]);
  });

  it("wants one answer for each person, not for each item", () => {
    const people = groupByPerson(items);
    expect(personsReady(people, {})).toBe(false);
    expect(personsReady(people, { fatma: "DROP" })).toBe(false);
    expect(personsReady(people, { fatma: "DROP", ummu: "TAKE_OVER" })).toBe(
      true
    );
  });

  it("sends the person's answer for every one of their items", () => {
    const people = groupByPerson(items);
    expect(
      personDecisions(people, { fatma: "DROP", ummu: "TAKE_OVER" })
    ).toEqual([
      { kind: "ROLE", id: "r1", action: "DROP" },
      { kind: "GRANT", id: "g1", action: "DROP" },
      { kind: "GRANT", id: "p1", action: "DROP" },
      { kind: "GRANT", id: "g2", action: "TAKE_OVER" },
    ]);
  });
});
