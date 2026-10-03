// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointNazir } from "~/features/nazirs/components/appoint-nazir";
import { NazirsTable } from "~/features/nazirs/components/nazirs-table";
import type { NazirRow } from "~/features/nazirs/nazirs";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";

const refresh = vi.fn();
const lookupPerson = vi.fn();
const appointNazir = vi.fn();
const getNazirGrants = vi.fn();
const dismissNazir = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/nazirs/actions", () => ({
  lookupPerson: (email: string) => lookupPerson(email),
  appointNazir: (id: string, userId: string) => appointNazir(id, userId),
  getNazirGrants: (id: string, userId: string) => getNazirGrants(id, userId),
  dismissNazir: (id: string, userId: string, decisions: unknown) =>
    dismissNazir(id, userId, decisions),
}));

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazir: resources.tr.nazir }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

/** The kit's dialog; a toast is a `role=dialog` too. */
const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";

beforeEach(() => {
  for (const fn of [
    refresh,
    lookupPerson,
    appointNazir,
    getNazirGrants,
    dismissNazir,
  ]) {
    fn.mockReset();
  }
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("'Medrese nazırı ata' (nazir 05)", () => {
  const mount = (held: string[] = []) =>
    render(
      wrap(
        <AppointNazir
          madrasahId="m-1"
          madrasahName="Süleymaniye Medresesi"
          held={held}
        />
      )
    );
  const open = async (held?: string[]) => {
    await mount(held);
    await click(buttonIn(document.body, "Medrese nazırı ata"));
    await settle(60);
  };
  const emailField = () =>
    document.querySelector("input[type=email]") as HTMLInputElement;
  const search = async (address: string) => {
    await typeInto(emailField(), address);
    await key(emailField(), "Enter");
    await settle(40);
  };
  const found = {
    kind: "found",
    person: {
      id: "u-9",
      name: "Abdullah Talha Erzurumluoğlu",
      email: "a.erzurumluoglu@example.com",
    },
  };

  it("opens a dialog for the medrese, with the e-mail field and no way to appoint yet", async () => {
    await open();
    expect(dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog().textContent).toContain("Süleymaniye Medresesi");
    expect(dialog().textContent).toContain("Medrese nazırı ata");
    expect(dialog().textContent).toContain("Nazırın e-posta adresi");
    expect(dialog().textContent).toContain("her arama denetim kaydına yazılır");
    expect(buttonIn(dialog(), "Ata").disabled).toBe(true);
    // a form dialog starts in its first field
    expect(document.activeElement).toBe(emailField());
  });

  it("searches an exact address on Enter, never on a key, and chooses the person found", async () => {
    lookupPerson.mockResolvedValue(found);
    await open();
    await typeInto(emailField(), "a.erzurumluoglu@example.com");
    expect(lookupPerson).not.toHaveBeenCalled();
    await key(emailField(), "Enter");
    await settle(40);

    expect(lookupPerson).toHaveBeenCalledExactlyOnceWith(
      "a.erzurumluoglu@example.com"
    );
    const chosen = document.querySelector("[data-testid=chosen-nazir]");
    expect(chosen?.textContent).toContain("Abdullah Talha Erzurumluoğlu");
    expect(chosen?.textContent).toContain("a.erzurumluoglu@example.com");
    expect(buttonIn(dialog(), "Ata").disabled).toBe(false);
  });

  it("does not search text that cannot be an address", async () => {
    await open();
    await search("abdullah");
    expect(lookupPerson).not.toHaveBeenCalled();
  });

  it("says so when no account has the address, and when the directory cannot be reached", async () => {
    lookupPerson.mockResolvedValue({ kind: "none" });
    await open();
    await search("kimse@example.com");
    expect(dialog().textContent).toContain(
      "Bu e-posta adresiyle kayıtlı bir hesap bulunamadı."
    );
    expect(buttonIn(dialog(), "Ata").disabled).toBe(true);

    lookupPerson.mockResolvedValue({ kind: "unavailable" });
    await search("baska@example.com");
    expect(dialog().textContent).toContain(
      "Arama şu an yapılamıyor. Biraz sonra yeniden deneyin."
    );
  });

  it("appoints the person with no permission, says so, and reads the roster again (criterion 3)", async () => {
    lookupPerson.mockResolvedValue(found);
    appointNazir.mockResolvedValue({ success: true, data: null });
    await open();
    await search("a.erzurumluoglu@example.com");
    await click(buttonIn(dialog(), "Ata"));
    await settle(60);

    expect(appointNazir).toHaveBeenCalledExactlyOnceWith("m-1", "u-9");
    expect(toast("success")).toContain("Nazır atandı");
    expect(toast("success")).toContain(
      "Abdullah Talha Erzurumluoğlu atandı; siz izin verene kadar hiçbir işlem yapamaz."
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("refuses a person who is a nazır already, instead of appointing them again", async () => {
    lookupPerson.mockResolvedValue(found);
    await open(["u-9"]);
    await search("a.erzurumluoglu@example.com");
    expect(dialog().textContent).toContain(
      "Bu kişi zaten bu medresenin nazırı."
    );
    expect(buttonIn(dialog(), "Ata").disabled).toBe(true);
  });

  it("keeps the dialog and says why when the appointment is refused", async () => {
    lookupPerson.mockResolvedValue(found);
    appointNazir.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await open();
    await search("a.erzurumluoglu@example.com");
    await click(buttonIn(dialog(), "Ata"));
    await settle(60);

    expect(toast("error")).toContain("Nazır atanamadı");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(dialog()).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("forgets the search when it is closed", async () => {
    lookupPerson.mockResolvedValue(found);
    await open();
    await search("a.erzurumluoglu@example.com");
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    await click(buttonIn(document.body, "Medrese nazırı ata"));
    await settle(60);
    expect(document.querySelector("[data-testid=chosen-nazir]")).toBeNull();
    expect(emailField().value).toBe("");
  });
});

describe("'Görevden al' (nazir 15)", () => {
  const rows: NazirRow[] = [
    {
      id: "u-1",
      name: "Fatma Zehra Çelebioğlu",
      email: "fz@example.com",
      groups: ["Ders açma ve kadro", "Yasak ve itiraz"],
      extra: "Ayrıca 3 izin: …",
      permissionCount: 3,
      awaiting: false,
      appointedLine: "",
      end: { label: "Süresiz", iso: null },
      giver: null,
    },
    {
      id: "u-3",
      name: "Abdullah Talha Erzurumluoğlu",
      email: "a@example.com",
      groups: [],
      extra: null,
      permissionCount: 0,
      awaiting: true,
      appointedLine: "Atayan: Fatma Zehra Çelebioğlu · 30 Eylül 2026",
      end: null,
      giver: null,
    },
  ];
  const person = (id: string, name: string, email: string) => ({
    id,
    name,
    email,
  });
  const given = [
    {
      user: person("u-3", "Abdullah Talha Erzurumluoğlu", "a@example.com"),
      roles: [
        {
          role: "MEDRESE_NAZIR",
          scopeType: "madrasah",
          scopeName: "Süleymaniye Medresesi",
          grantedAt: new Date("2026-09-30T09:00:00Z"),
          expiresAt: null,
        },
      ],
      groups: [],
      permissions: [],
    },
    {
      user: person("u-4", "Ayşe Nur Kılıçarslan", "ayse@example.com"),
      roles: [],
      groups: [{ id: "g-1", name: "Kayıt ve talebe işleri", permissions: [] }],
      permissions: ["course.edit", "week.hide"],
    },
  ];

  const mount = () =>
    render(
      wrap(
        <NazirsTable
          rows={rows}
          madrasahId="m-1"
          madrasahName="Süleymaniye Medresesi"
          locale="tr"
          timeZone="Europe/Istanbul"
        />
      )
    );
  const dismissButton = (name: string) =>
    document.querySelector(
      `button[aria-label="Görevden al: ${name}"]`
    ) as HTMLButtonElement;
  const open = async (name = rows[0]?.name ?? "") => {
    await click(dismissButton(name));
    await settle(80);
  };
  const choose = async (personName: string, answer: "Devral" | "Düşür") => {
    const row = [
      ...document.querySelectorAll("[data-testid=given-person]"),
    ].find((r) => r.textContent?.includes(personName)) as HTMLElement;
    await click(buttonIn(row, answer));
  };
  const submit = () => buttonIn(dialog(), "Görevden al");

  /** After 4 Ekim 2026, the clock only the gate reads. */
  const afterGate = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
  };

  it("is off on every row before 4 Ekim 2026 and says nothing about why", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T09:00:00+03:00"));
    await mount();
    for (const row of rows) {
      expect(dismissButton(row.name).disabled, row.name).toBe(true);
    }
    expect(document.body.textContent).not.toMatch(/4 Ekim|sürüm/i);
  });

  it("is on from 4 Ekim 2026, read on the viewer's clock without a reload", async () => {
    afterGate();
    await mount();
    for (const row of rows) {
      expect(dismissButton(row.name).disabled, row.name).toBe(false);
    }
  });

  it("asks what became of what the nazır gave, one row per person, with nothing chosen for the başmüderris (criterion 1)", async () => {
    afterGate();
    getNazirGrants.mockResolvedValue({ success: true, data: given });
    await mount();
    await open();

    expect(getNazirGrants).toHaveBeenCalledExactlyOnceWith("m-1", "u-1");
    expect(dialog().textContent).toContain("Süleymaniye Medresesi");
    expect(dialog().textContent).toContain(
      "Fatma Zehra Çelebioğlu görevden alınıyor"
    );
    expect(dialog().textContent).toContain(
      "Fatma Zehra Çelebioğlu şu kişilere rol ve izin vermişti. Her biri için ne olacağını seçin."
    );
    const people = [
      ...document.querySelectorAll("[data-testid=given-person]"),
    ] as HTMLElement[];
    expect(people).toHaveLength(2);
    expect(people[0]?.textContent).toContain("a@example.com");
    expect(people[0]?.textContent).toContain(
      "Medrese nazırı · Süleymaniye Medresesi · süresiz · verildi 30 Eylül 2026"
    );
    expect(people[0]?.textContent).toContain(
      "Hiç izni yok; medrese nazırı atadığı nazıra izin veremez."
    );
    expect(people[1]?.textContent).toContain("Kayıt ve talebe işleri");
    expect(people[1]?.textContent).toContain("Ayrıca 2 izin:");
    for (const chip of dialog().querySelectorAll("button[aria-pressed]")) {
      expect(chip.getAttribute("aria-pressed")).toBe("false");
    }
    expect(dialog().textContent).toContain(
      "Her satır için seçim yapılmadan görevden alınamaz."
    );
    expect(dialog().textContent).toContain(
      "Görevden alınırsa Fatma Zehra Çelebioğlu için “Ders açma ve kadro” ve “Yasak ve itiraz” grupları ile 3 ek izin hemen düşer."
    );
    expect(submit().disabled).toBe(true);
  });

  it("starts with the focus on 'Vazgeç'", async () => {
    afterGate();
    getNazirGrants.mockResolvedValue({ success: true, data: given });
    await mount();
    await open();
    expect(document.activeElement).toBe(buttonIn(dialog(), "Vazgeç"));
  });

  it("turns 'Görevden al' on only when every row has an answer, and sends one decision per person (criteria 1, 3, 4)", async () => {
    afterGate();
    getNazirGrants.mockResolvedValue({ success: true, data: given });
    dismissNazir.mockResolvedValue({ success: true, data: null });
    await mount();
    await open();

    await choose("Abdullah Talha", "Devral");
    expect(submit().disabled).toBe(true);
    await choose("Ayşe Nur", "Düşür");
    expect(submit().disabled).toBe(false);

    // choosing the same answer again takes it back
    await choose("Ayşe Nur", "Düşür");
    expect(submit().disabled).toBe(true);
    await choose("Ayşe Nur", "Düşür");

    await click(submit());
    await settle(60);
    expect(dismissNazir).toHaveBeenCalledExactlyOnceWith("m-1", "u-1", [
      { userId: "u-3", action: "TAKE_OVER" },
      { userId: "u-4", action: "DROP" },
    ]);
    expect(toast("success")).toContain("Görevden alındı");
    expect(toast("success")).toContain(
      "Fatma Zehra Çelebioğlu artık bu medresenin nazırı değil."
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("skips the choice when the nazır gave no one anything, and sends an empty list", async () => {
    afterGate();
    getNazirGrants.mockResolvedValue({ success: true, data: [] });
    dismissNazir.mockResolvedValue({ success: true, data: null });
    await mount();
    await open("Abdullah Talha Erzurumluoğlu");

    expect(
      document.querySelectorAll("[data-testid=given-person]")
    ).toHaveLength(0);
    expect(dialog().textContent).toContain("seçilecek bir şey yok");
    expect(dialog().textContent).toContain(
      "Abdullah Talha Erzurumluoğlu henüz izin almadığı için düşecek bir izin yok."
    );
    expect(submit().disabled).toBe(false);
    await click(submit());
    await settle(60);
    expect(dismissNazir).toHaveBeenCalledExactlyOnceWith("m-1", "u-3", []);
  });

  it("reads the list again and clears the answers when the API says it moved (criterion 4)", async () => {
    afterGate();
    getNazirGrants.mockResolvedValue({ success: true, data: given });
    dismissNazir.mockResolvedValue({
      success: false,
      code: "DISMISS_DECISIONS_INCOMPLETE",
    });
    await mount();
    await open();
    await choose("Abdullah Talha", "Devral");
    await choose("Ayşe Nur", "Düşür");
    await click(submit());
    await settle(80);

    expect(toast("error")).toContain("Görevden alınamadı");
    expect(toast("error")).toContain(
      "Bu kişinin verdikleri siz bakarken değişti."
    );
    expect(getNazirGrants).toHaveBeenCalledTimes(2);
    expect(submit().disabled).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes and reads the roster again when the nazır is no longer one", async () => {
    afterGate();
    getNazirGrants.mockResolvedValue({ success: true, data: [] });
    dismissNazir.mockResolvedValue({
      success: false,
      code: "MADRASAH_NAZIR_NOT_FOUND",
    });
    await mount();
    await open();
    await click(submit());
    await settle(80);
    expect(toast("error")).toContain(
      "Bu kişi artık bu medresenin nazırı değil."
    );
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says the list could not be read, offers to try again, and does not let the nazır be dismissed blind", async () => {
    afterGate();
    getNazirGrants.mockResolvedValueOnce({ success: false, code: "" });
    await mount();
    await open();

    expect(dialog().textContent).toContain("Liste okunamadı");
    expect(submit().disabled).toBe(true);

    getNazirGrants.mockResolvedValueOnce({ success: true, data: [] });
    await click(buttonIn(dialog(), "Yeniden dene"));
    await settle(60);
    expect(dialog().textContent).not.toContain("Liste okunamadı");
    expect(submit().disabled).toBe(false);
  });

  it("closes with Vazgeç and writes nothing", async () => {
    afterGate();
    getNazirGrants.mockResolvedValue({ success: true, data: given });
    await mount();
    await open();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    expect(dialog()).toBeNull();
    expect(dismissNazir).not.toHaveBeenCalled();
  });
});
