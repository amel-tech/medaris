// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionEditor } from "~/features/nazirs/components/permission-editor";
import type { NazirRow } from "~/features/nazirs/nazirs";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const loadEditor = vi.fn();
const saveNazirPermissions = vi.fn();
const onClose = vi.fn();
const onDone = vi.fn();

vi.mock("~/features/nazirs/actions", () => ({
  loadEditor: (id: string, userId: string) => loadEditor(id, userId),
  saveNazirPermissions: (id: string, userId: string, request: unknown) =>
    saveNazirPermissions(id, userId, request),
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

const MADRASAH = [
  "madrasah.course_open",
  "madrasah.muderris_manage",
  "madrasah.students_view",
  "madrasah.ban",
  "madrasah.course_hide",
  "madrasah.admission_rules",
  "madrasah.appeal_open",
  "madrasah.permanent_ban_request",
  "madrasah.settings_edit",
  "madrasah.nazir_appoint",
];
const COURSE = [
  "course.edit",
  "session.manage",
  "session.live_link",
  "week.hide",
  "course.settings",
  "course.publish",
  "course.view_unpublished",
  "enrollment.decide",
  "enrollment.remove",
  "enrollment.complete",
  "recording.manage",
  "recording.upload",
  "recording.watch_restricted",
  "session.view_content",
  "ban.course",
  "ban.lift_course",
  "deck.manage_course",
  "course_nazir.assign",
  "permission_group.define",
  "user.lookup",
];

const kayit = {
  id: "g-kayit",
  name: "Kayıt ve talebe işleri",
  scope: "COURSE",
  permissions: ["enrollment.decide", "enrollment.remove"],
  userCount: 1,
};
const dersAcma = {
  id: "g-ders",
  name: "Ders açma ve kadro",
  scope: "MADRASAH",
  permissions: ["madrasah.course_open", "course.edit"],
  userCount: 0,
};

/** What `loadEditor` answers; a spec overrides what it is about. */
const editorData = (over: Record<string, unknown> = {}) => ({
  success: true as const,
  data: {
    catalog: {
      madrasah: MADRASAH,
      course: COURSE,
      givable: [...MADRASAH, ...COURSE],
    },
    groups: [kayit, dersAcma],
    held: { groupId: null, permissions: [], courseIds: null, expiresAt: null },
    courses: [
      { id: "c-1", title: "Bina ve İzhar Şerhi" },
      { id: "c-2", title: "İsâgûcî ile mantığa giriş" },
    ],
    ...over,
  },
});

const abdullah: NazirRow = {
  id: "u-3",
  name: "Abdullah Talha Erzurumluoğlu",
  email: "a.erzurumluoglu@example.com",
  groups: [],
  extra: null,
  permissionCount: 0,
  courseScope: null,
  awaiting: true,
  assignmentEnd: null,
  appointedLine: "Atayan: Fatma Zehra Çelebioğlu · 30 Eylül 2026",
  appointedById: "u-1",
  end: null,
  giver: null,
};

const mount = (nazir: NazirRow | null = abdullah) =>
  render(
    wrap(
      <PermissionEditor
        madrasahId="m-1"
        madrasahName="Süleymaniye Medresesi"
        nazir={nazir}
        timeZone="Europe/Istanbul"
        onClose={onClose}
        onDone={onDone}
      />
    )
  );
const open = async (answer = editorData(), nazir = abdullah) => {
  loadEditor.mockResolvedValue(answer);
  await mount(nazir);
  await settle(80);
};

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const button = (label: string) =>
  [...dialog().querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const row = (sentence: string) =>
  [...dialog().querySelectorAll("label.mds-choice")].find(
    (l) => l.querySelector(".mds-choice__label")?.textContent === sentence
  ) as HTMLElement;
const box = (sentence: string) =>
  row(sentence)?.querySelector("[role=checkbox]") as HTMLElement;
/** happy-dom does not forward a click on the box to its input; the label does, as the browser's does. */
const toggle = (sentence: string) => click(row(sentence));
const checked = (sentence: string) =>
  box(sentence).getAttribute("aria-checked") === "true";
const locked = (sentence: string) =>
  box(sentence).getAttribute("aria-disabled") === "true" ||
  box(sentence).hasAttribute("disabled") ||
  box(sentence).hasAttribute("data-disabled");
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const triggers = () =>
  [...dialog().querySelectorAll("button.mds-input")] as HTMLElement[];
const choose = async (index: number, label: string) => {
  await click(triggers()[index] as Element);
  await settle(50);
  const option = [...document.querySelectorAll(".mds-option")].find(
    (o) => o.textContent?.trim() === label
  );
  expect(option, label).toBeDefined();
  await click(option as Element);
  await settle(80);
};
const dateField = () =>
  dialog().querySelector("input[type=datetime-local]") as HTMLInputElement;

beforeEach(() => {
  for (const fn of [loadEditor, saveNazirPermissions, onClose, onDone]) {
    fn.mockReset();
  }
  saveNazirPermissions.mockResolvedValue({ success: true, data: null });
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("'İzinleri düzenle' (nazir 06)", () => {
  it("opens for the medrese with the nazır's name, address and who appointed them, and bars while it reads", async () => {
    loadEditor.mockReturnValue(new Promise(() => {}));
    await mount();
    await settle(40);
    expect(loadEditor).toHaveBeenCalledExactlyOnceWith("m-1", "u-3");
    expect(dialog().textContent).toContain("Süleymaniye Medresesi");
    expect(dialog().textContent).toContain("İzinleri düzenle");
    expect(dialog().textContent).toContain("Abdullah Talha Erzurumluoğlu");
    expect(dialog().textContent).toContain("a.erzurumluoglu@example.com");
    expect(dialog().textContent).toContain(
      "Medrese nazırı · Atayan: Fatma Zehra Çelebioğlu · 30 Eylül 2026"
    );
    expect(dialog().querySelector("[aria-busy=true]")).not.toBeNull();
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(0);
    expect(button("Kaydet").disabled).toBe(true);
  });

  it("lists the ten medrese permissions and the twenty course permissions, with the canvas's words", async () => {
    await open();
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(30);
    for (const sentence of [
      "Medrese dersi aç",
      "Müderris ekle ya da çıkar; imamı değiştir",
      "Medrese nazırı ata",
      "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi",
    ]) {
      expect(box(sentence), sentence).toBeDefined();
    }
    expect(dialog().textContent).toContain("Hazır izin grubu");
    expect(dialog().textContent).toContain("Medrese dersleri");
    expect(dialog().textContent).toContain("Hangi derslerde");
    expect(dialog().textContent).toContain(
      "Bütün medrese dersleri, sonradan açılacak dersleri de kapsar."
    );
    expect(dialog().textContent).toContain(
      "Bitiş tarihi ve saati (isteğe bağlı)"
    );
    expect(dialog().textContent).toContain(
      "Aldığı izni başkasına veremez. Verilen ve geri alınan her izin denetim kaydına yazılır."
    );
    expect(dialog().textContent).toContain("Hiç izin seçilmedi");
    expect(document.activeElement).toBe(triggers()[0]);
  });

  it("makes the group's permissions ticked and locked, and lets an extra one be ticked (criterion 1)", async () => {
    await open();
    await choose(0, "Kayıt ve talebe işleri");

    const decide = "Başvuruyu onayla ya da reddet";
    expect(checked(decide)).toBe(true);
    expect(locked(decide)).toBe(true);
    expect(dialog().textContent).toContain("Gruptan gelir.");
    expect(dialog().textContent).toContain("Gruptan 2 izin");

    await toggle("Hafta ve celse gizle, geri al");
    expect(checked("Hafta ve celse gizle, geri al")).toBe(true);
    expect(dialog().textContent).toContain("Gruptan 2 izin ve 1 ek izin");
  });

  it("opens ticked from what the nazır holds, the group's own permissions locked", async () => {
    await open(
      editorData({
        held: {
          groupId: "g-kayit",
          permissions: ["week.hide"],
          courseIds: null,
          expiresAt: "2026-12-31T20:59:00.000Z",
        },
      })
    );
    expect(triggers()[0]?.textContent).toContain("Kayıt ve talebe işleri");
    expect(locked("Başvuruyu onayla ya da reddet")).toBe(true);
    expect(checked("Hafta ve celse gizle, geri al")).toBe(true);
    expect(locked("Hafta ve celse gizle, geri al")).toBe(false);
    expect(dateField().value).toBe("2026-12-31T23:59");
  });

  it("switches a permission the caller may not give off (criterion 2)", async () => {
    await open(
      editorData({
        catalog: {
          madrasah: MADRASAH,
          course: COURSE,
          givable: ["week.hide"],
        },
      })
    );
    expect(locked("Medrese nazırı ata")).toBe(true);
    expect(locked("Hafta ve celse gizle, geri al")).toBe(false);
  });

  it("saves the group, the single permissions, every course and no end, then says so and reads the roster again (criterion 4)", async () => {
    await open();
    await choose(0, "Kayıt ve talebe işleri");
    await toggle("Hafta ve celse gizle, geri al");
    await toggle("Medrese nazırı ata");
    await click(button("Kaydet"));
    await settle(80);

    expect(saveNazirPermissions).toHaveBeenCalledExactlyOnceWith("m-1", "u-3", {
      groupId: "g-kayit",
      permissions: ["madrasah.nazir_appoint", "week.hide"],
      courseIds: null,
      expiresAt: null,
    });
    expect(toast("success")).toContain("İzinler kaydedildi");
    expect(toast("success")).toContain(
      "Abdullah Talha Erzurumluoğlu için izinler güncellendi."
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("limits a group that carries no medrese permission, and the single ones, to the courses chosen", async () => {
    await open();
    await choose(0, "Kayıt ve talebe işleri");
    // the second select is "Hangi derslerde"
    await choose(1, "Seçtiğim dersler");
    expect(
      dialog().querySelector("[data-testid=chosen-courses]")
    ).not.toBeNull();

    // nothing chosen yet: refused on the page, nothing sent
    await click(button("Kaydet"));
    await settle(40);
    expect(dialog().textContent).toContain("En az bir ders seçin.");
    expect(saveNazirPermissions).not.toHaveBeenCalled();

    const course = [
      ...dialog().querySelectorAll(
        "[data-testid=chosen-courses] label.mds-choice"
      ),
    ].find((l) => l.textContent?.includes("İsâgûcî")) as HTMLElement;
    await click(course);
    await click(button("Kaydet"));
    await settle(80);
    expect(saveNazirPermissions).toHaveBeenCalledExactlyOnceWith("m-1", "u-3", {
      groupId: "g-kayit",
      permissions: [],
      courseIds: ["c-2"],
      expiresAt: null,
    });
  });

  it("does not let a group with a medrese permission be limited to courses", async () => {
    await open(
      editorData({
        held: {
          groupId: "g-ders",
          permissions: [],
          courseIds: null,
          expiresAt: null,
        },
      })
    );
    const select = triggers()[1] as HTMLElement;
    expect(
      select.hasAttribute("disabled") ||
        select.getAttribute("aria-disabled") === "true" ||
        select.hasAttribute("data-disabled")
    ).toBe(true);
    expect(dialog().textContent).toContain(
      "Grup medrese izinleri taşıdığı için bütün medrese derslerinde geçer."
    );
  });

  it("sends every course when courses are chosen but no course permission is given, since there is nothing to limit", async () => {
    await open();
    await choose(1, "Seçtiğim dersler");
    expect(dialog().textContent).toContain(
      "Seçtiğiniz dersler, bir ders izni işaretleyince geçerli olur."
    );
    await toggle("Medrese nazırı ata");
    await click(button("Kaydet"));
    await settle(80);
    expect(saveNazirPermissions).toHaveBeenCalledExactlyOnceWith("m-1", "u-3", {
      groupId: null,
      permissions: ["madrasah.nazir_appoint"],
      courseIds: null,
      expiresAt: null,
    });
  });

  it("asks for a date and a time, refuses a moment not after now on the page, and sends the moment typed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
    await open();
    expect(dateField()).not.toBeNull();
    expect(dateField().type).toBe("datetime-local");
    await typeInto(dateField(), "2026-10-05T09:59");
    await click(button("Kaydet"));
    await settle(40);
    expect(dialog().textContent).toContain(
      "Bitiş zamanı şu andan sonra olmalı."
    );
    expect(saveNazirPermissions).not.toHaveBeenCalled();

    await typeInto(dateField(), "2026-12-31T23:59");
    await click(button("Kaydet"));
    await settle(80);
    expect(saveNazirPermissions).toHaveBeenCalledExactlyOnceWith("m-1", "u-3", {
      groupId: null,
      permissions: [],
      courseIds: null,
      expiresAt: "2026-12-31T20:59:00.000Z",
    });
  });

  it("sends an end left as it was back as the instant the API holds, seconds and all", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
    await open(
      editorData({
        held: {
          groupId: null,
          permissions: ["week.hide"],
          courseIds: null,
          expiresAt: "2026-12-31T20:59:59.000Z",
        },
      }),
      { ...abdullah, assignmentEnd: "2026-12-31T20:59:59.000Z" }
    );
    expect(dateField().value).toBe("2026-12-31T23:59");
    await click(button("Kaydet"));
    await settle(80);
    expect(saveNazirPermissions).toHaveBeenCalledExactlyOnceWith("m-1", "u-3", {
      groupId: null,
      permissions: ["week.hide"],
      courseIds: null,
      expiresAt: "2026-12-31T20:59:59.000Z",
    });
  });

  it("refuses a moment a minute after the appointment ends, before sending", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
    await open(
      editorData({
        held: {
          groupId: null,
          permissions: ["week.hide"],
          courseIds: null,
          expiresAt: "2026-12-31T20:59:59.000Z",
        },
      }),
      { ...abdullah, assignmentEnd: "2026-12-31T20:59:59.000Z" }
    );
    await typeInto(dateField(), "2027-01-01T00:00");
    await click(button("Kaydet"));
    await settle(40);
    expect(dialog().textContent).toContain(
      "Bitiş zamanı, görevin bitişinden sonra olamaz."
    );
    expect(saveNazirPermissions).not.toHaveBeenCalled();
  });

  describe("an end left half typed", () => {
    // A datetime-local field keeps "" until every segment is filled and says so
    // in validity.badInput; happy-dom has no widget, so the flag is set by hand.
    const halfTyped = (on: boolean) =>
      Object.defineProperty(dateField(), "validity", {
        configurable: true,
        get: () => ({ badInput: on }),
      });
    const leave = () =>
      act(async () => {
        dateField().dispatchEvent(
          new FocusEvent("focusout", { bubbles: true })
        );
      });
    const SENTENCE = "Bitiş tarihini ve saatini tamamlayın.";

    it("is refused on saving, even when the field was never left", async () => {
      await open();
      halfTyped(true);
      await click(button("Kaydet"));
      await settle(40);
      expect(dialog().textContent).toContain(SENTENCE);
      expect(saveNazirPermissions).not.toHaveBeenCalled();
    });

    it("is refused on saving after the field was left", async () => {
      await open();
      halfTyped(true);
      await leave();
      await click(button("Kaydet"));
      await settle(40);
      expect(dialog().textContent).toContain(SENTENCE);
      expect(saveNazirPermissions).not.toHaveBeenCalled();
    });

    it("is allowed again once the time is typed, and sends the moment", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
      await open();
      halfTyped(true);
      await leave();
      halfTyped(false);
      await typeInto(dateField(), "2026-12-31T23:59");
      await click(button("Kaydet"));
      await settle(80);
      expect(dialog()?.textContent ?? "").not.toContain(SENTENCE);
      expect(saveNazirPermissions).toHaveBeenCalledExactlyOnceWith(
        "m-1",
        "u-3",
        {
          groupId: null,
          permissions: [],
          courseIds: null,
          expiresAt: "2026-12-31T20:59:00.000Z",
        }
      );
    });

    it("does not stand in the way of an end that is empty on purpose", async () => {
      await open();
      halfTyped(false);
      await leave();
      await click(button("Kaydet"));
      await settle(80);
      expect(saveNazirPermissions).toHaveBeenCalledExactlyOnceWith(
        "m-1",
        "u-3",
        { groupId: null, permissions: [], courseIds: null, expiresAt: null }
      );
    });
  });

  it("keeps the dialog and says why when the API refuses (criterion 2: the server refuses too)", async () => {
    saveNazirPermissions.mockResolvedValue({
      success: false,
      code: "PERMISSION_NOT_GIVABLE",
    });
    await open();
    await click(button("Kaydet"));
    await settle(80);
    expect(toast("error")).toContain("İzinler kaydedilemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("reads again when the chosen group is gone, and closes when the nazır is", async () => {
    saveNazirPermissions.mockResolvedValueOnce({
      success: false,
      code: "PERMISSION_GROUP_NOT_FOUND",
    });
    await open();
    await click(button("Kaydet"));
    await settle(80);
    expect(toast("error")).toContain("Bu grup artık yok.");
    expect(loadEditor).toHaveBeenCalledTimes(2);

    saveNazirPermissions.mockResolvedValueOnce({
      success: false,
      code: "MADRASAH_NAZIR_NOT_FOUND",
    });
    await click(button("Kaydet"));
    await settle(80);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("says the permissions could not be read, offers to try again, and saves nothing blind", async () => {
    loadEditor.mockResolvedValueOnce({ success: false, code: "" });
    await mount();
    await settle(80);
    expect(dialog().textContent).toContain("İzinler okunamadı");
    expect(button("Kaydet").disabled).toBe(true);

    loadEditor.mockResolvedValueOnce(editorData());
    await click(button("Yeniden dene"));
    await settle(80);
    expect(dialog().textContent).not.toContain("İzinler okunamadı");
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(30);
    expect(button("Kaydet").disabled).toBe(false);
  });

  it("closes with Vazgeç and writes nothing", async () => {
    await open();
    await click(button("Vazgeç"));
    await settle(40);
    expect(onClose).toHaveBeenCalled();
    expect(saveNazirPermissions).not.toHaveBeenCalled();
  });
});
