// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GroupDialog,
  type GroupTarget,
} from "~/features/nazirs/components/group-dialog";
import { PermissionGroups } from "~/features/nazirs/components/permission-groups";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const loadCatalog = vi.fn();
const createGroup = vi.fn();
const updateGroup = vi.fn();
const removeGroup = vi.fn();
const onClose = vi.fn();
const onDone = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/nazirs/actions", () => ({
  loadCatalog: (id: string) => loadCatalog(id),
  createGroup: (id: string, body: unknown) => createGroup(id, body),
  updateGroup: (id: string, groupId: string, patch: unknown, policy?: string) =>
    updateGroup(id, groupId, patch, policy),
  removeGroup: (id: string, groupId: string, policy?: string) =>
    removeGroup(id, groupId, policy),
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
  "question.answer",
  "ban.course",
  "ban.lift_course",
  "deck.manage_course",
  "course_nazir.assign",
  "permission_group.define",
  "user.lookup",
];
const catalog = (givable = [...MADRASAH, ...COURSE]) => ({
  success: true as const,
  data: { madrasah: MADRASAH, course: COURSE, givable },
});

const kayit = {
  id: "g-1",
  name: "Kayıt ve talebe işleri",
  scope: "COURSE" as const,
  permissions: ["enrollment.decide", "enrollment.remove"],
  userCount: 2,
};
const bos = { ...kayit, id: "g-2", name: "Yasak ve itiraz", userCount: 0 };

const mount = (target: GroupTarget | null) =>
  render(
    wrap(
      <GroupDialog
        madrasahId="m-1"
        madrasahName="Süleymaniye Medresesi"
        target={target}
        onClose={onClose}
        onDone={onDone}
      />
    )
  );
const open = async (target: GroupTarget, answer = catalog()) => {
  loadCatalog.mockResolvedValue(answer);
  await mount(target);
  await settle(80);
};

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
/** the question: an alert dialog, which the form dialog's own `role` does not share */
const question = () =>
  document.querySelector("[role=alertdialog]") as HTMLElement | null;
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
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
const off = (sentence: string) =>
  box(sentence).getAttribute("aria-disabled") === "true" ||
  box(sentence).hasAttribute("data-disabled") ||
  box(sentence).hasAttribute("disabled");
const nameField = () =>
  dialog().querySelector("input[name=name]") as HTMLInputElement;
const scopeRadio = (label: string) =>
  [...dialog().querySelectorAll("[role=radio]")].find((r) =>
    r.closest("label")?.textContent?.startsWith(label)
  ) as HTMLElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";

beforeEach(() => {
  for (const fn of [
    loadCatalog,
    createGroup,
    updateGroup,
    removeGroup,
    onClose,
    onDone,
    refresh,
  ]) {
    fn.mockReset();
  }
  createGroup.mockResolvedValue({ success: true });
  updateGroup.mockResolvedValue({ success: true });
  removeGroup.mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe("'İzin grubu tanımla' (nazir 16)", () => {
  it("opens for the medrese on its first field, with 'Medrese' chosen and no permission yet", async () => {
    await open({ mode: "create" });
    expect(dialog().textContent).toContain("Süleymaniye Medresesi");
    expect(dialog().textContent).toContain("İzin grubu tanımla");
    expect(dialog().textContent).toContain("Grup adı");
    expect(dialog().textContent).toContain("İzin verirken bu adı görürsünüz.");
    expect(dialog().textContent).toContain(
      "Kapsam, gruba girebilecek izinleri belirler. Grup yalnız bu medresede ve medrese derslerinde geçerlidir."
    );
    expect(dialog().textContent).toContain(
      "Yalnız verebileceğiniz izinler listelenir. 0 izin seçili."
    );
    expect(dialog().textContent).toContain("Medrese kapsamı · 0 izin seçili");
    expect(scopeRadio("Medrese").getAttribute("aria-checked")).toBe("true");
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(31);
    expect(button(dialog(), "Grubu kaydet")).toBeDefined();
    expect(document.activeElement).toBe(nameField());
  });

  it("shows bars for the permissions while the dictionary is read, and a retry when it cannot be", async () => {
    loadCatalog.mockReturnValueOnce(new Promise(() => {}));
    await mount({ mode: "create" });
    await settle(40);
    expect(dialog().querySelector("[aria-busy=true]")).not.toBeNull();
    expect(button(dialog(), "Grubu kaydet").disabled).toBe(true);
    await cleanup();

    loadCatalog.mockResolvedValueOnce({ success: false, code: "" });
    await mount({ mode: "create" });
    await settle(80);
    expect(dialog().textContent).toContain("İzin listesi okunamadı");
    expect(button(dialog(), "Grubu kaydet").disabled).toBe(true);
    loadCatalog.mockResolvedValueOnce(catalog());
    await click(button(dialog(), "Yeniden dene"));
    await settle(80);
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(31);
  });

  it("is not saved without a name and a permission, and says which is missing (criterion 1)", async () => {
    await open({ mode: "create" });
    await click(button(dialog(), "Grubu kaydet"));
    await settle(40);
    expect(createGroup).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain("Grup adı boş olamaz.");
    expect(dialog().textContent).toContain("En az bir izin seçin.");

    await typeInto(nameField(), "Ders açma");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(40);
    expect(createGroup).not.toHaveBeenCalled();
    expect(dialog().textContent).not.toContain("Grup adı boş olamaz.");
    expect(dialog().textContent).toContain("En az bir izin seçin.");
  });

  it("counts what is ticked ('N izin') and saves the trimmed name, the scope and the permissions (criterion 5)", async () => {
    await open({ mode: "create" });
    await typeInto(nameField(), "  Ders açma ve kadro ");
    await toggle("Hafta ve celse gizle, geri al");
    await toggle("Medrese dersi aç");
    expect(dialog().textContent).toContain("Medrese kapsamı · 2 izin seçili");
    expect(dialog().textContent).toContain(
      "Yalnız verebileceğiniz izinler listelenir. 2 izin seçili."
    );
    await click(button(dialog(), "Grubu kaydet"));
    await settle(80);

    expect(createGroup).toHaveBeenCalledExactlyOnceWith("m-1", {
      name: "Ders açma ve kadro",
      scope: "MADRASAH",
      permissions: ["madrasah.course_open", "week.hide"],
    });
    expect(toast("success")).toContain("Grup kaydedildi");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("turns the medrese's permissions off under 'Ders' and unticks the ones already ticked (criterion 3)", async () => {
    await open({ mode: "create" });
    await toggle("Medrese dersi aç");
    await toggle("Hafta ve celse gizle, geri al");
    await click(scopeRadio("Ders"));
    await settle(40);

    expect(off("Medrese dersi aç")).toBe(true);
    expect(off("Medrese nazırı ata")).toBe(true);
    expect(checked("Medrese dersi aç")).toBe(false);
    expect(off("Hafta ve celse gizle, geri al")).toBe(false);
    expect(checked("Hafta ve celse gizle, geri al")).toBe(true);
    expect(dialog().textContent).toContain("Ders kapsamı · 1 izin seçili");
  });

  it("switches a permission the caller may not give off (criterion 2)", async () => {
    await open({ mode: "create" }, catalog(["week.hide"]));
    expect(off("Medrese dersi aç")).toBe(true);
    expect(off("Hafta ve celse gizle, geri al")).toBe(false);
  });

  it("says under the name when another group has it, and keeps the dialog", async () => {
    createGroup.mockResolvedValue({
      success: false,
      code: "PERMISSION_GROUP_NAME_TAKEN",
    });
    await open({ mode: "create" });
    await typeInto(nameField(), "Ders açma");
    await toggle("Hafta ve celse gizle, geri al");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(80);
    expect(dialog().textContent).toContain(
      "Bu adla başka bir grup var. Başka bir ad seçin."
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says why in a toast when the API refuses, and closes with Vazgeç without writing", async () => {
    createGroup.mockResolvedValue({
      success: false,
      code: "PERMISSION_NOT_GIVABLE",
    });
    await open({ mode: "create" });
    await typeInto(nameField(), "Ders açma");
    await toggle("Hafta ve celse gizle, geri al");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(80);
    expect(toast("error")).toContain("Grup kaydedilemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");

    createGroup.mockClear();
    await click(button(dialog(), "Vazgeç"));
    await settle(40);
    expect(onClose).toHaveBeenCalled();
    expect(createGroup).not.toHaveBeenCalled();
  });
});

describe("'İzin grubunu düzenle' (nazir 16)", () => {
  it("opens with the group's name, scope and permissions", async () => {
    await open({ mode: "edit", group: kayit });
    expect(dialog().textContent).toContain("İzin grubunu düzenle");
    expect(nameField().value).toBe("Kayıt ve talebe işleri");
    expect(scopeRadio("Ders").getAttribute("aria-checked")).toBe("true");
    expect(checked("Başvuruyu onayla ya da reddet")).toBe(true);
    expect(checked("Hafta ve celse gizle, geri al")).toBe(false);
    expect(dialog().textContent).toContain("Bu grubu 2 kişi kullanıyor.");
    expect(button(dialog(), "Grubu sil")).toBeDefined();
  });

  it("changes a rename on its own without asking, though people use the group", async () => {
    await open({ mode: "edit", group: kayit });
    await typeInto(nameField(), "Kayıt işleri");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(80);
    expect(question()).toBeNull();
    expect(updateGroup).toHaveBeenCalledExactlyOnceWith(
      "m-1",
      "g-1",
      { name: "Kayıt işleri" },
      undefined
    );
    expect(toast("success")).toContain("“Kayıt işleri” grubu kaydedildi.");
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("asks what becomes of the people who use it when the permissions change, with no answer chosen and the button off until one is (criterion 4)", async () => {
    await open({ mode: "edit", group: kayit });
    await toggle("Hafta ve celse gizle, geri al");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(80);

    expect(updateGroup).not.toHaveBeenCalled();
    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain("Bu grubu 2 kişi kullanıyor");
    expect(ask.querySelectorAll("[role=radio]")).toHaveLength(2);
    for (const radio of ask.querySelectorAll("[role=radio]")) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
    expect(button(ask, "Grubu kaydet").disabled).toBe(true);
    // the focus starts on Vazgeç
    expect(document.activeElement).toBe(button(ask, "Vazgeç"));

    await click(
      [...ask.querySelectorAll("[role=radio]")].find((r) =>
        r.closest("label")?.textContent?.includes("İzinleri korusunlar")
      ) as Element
    );
    await settle(40);
    expect(button(ask, "Grubu kaydet").disabled).toBe(false);
    await click(button(ask, "Grubu kaydet"));
    await settle(80);

    expect(updateGroup).toHaveBeenCalledExactlyOnceWith(
      "m-1",
      "g-1",
      { permissions: ["week.hide", "enrollment.decide", "enrollment.remove"] },
      "keep"
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("does not ask when nobody uses the group", async () => {
    await open({ mode: "edit", group: bos });
    await toggle("Hafta ve celse gizle, geri al");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(80);
    expect(question()).toBeNull();
    expect(updateGroup).toHaveBeenCalledOnce();
    expect(updateGroup.mock.calls[0]?.[3]).toBeUndefined();
  });

  it("asks with the API's count when the group was taken up while the dialog was open", async () => {
    updateGroup.mockResolvedValueOnce({
      success: false,
      code: "USERS_POLICY_REQUIRED",
      userCount: 3,
    });
    await open({ mode: "edit", group: bos });
    await toggle("Hafta ve celse gizle, geri al");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(80);

    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain("Bu grubu 3 kişi kullanıyor");
    await click(
      [...ask.querySelectorAll("[role=radio]")].find((r) =>
        r.closest("label")?.textContent?.includes("İzinleri kaybetsinler")
      ) as Element
    );
    await settle(40);
    await click(button(ask, "Grubu kaydet"));
    await settle(80);
    expect(updateGroup.mock.calls[1]?.[3]).toBe("revoke");
  });

  it("writes nothing when nothing changed", async () => {
    await open({ mode: "edit", group: kayit });
    await click(button(dialog(), "Grubu kaydet"));
    await settle(40);
    expect(updateGroup).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("'Grubu sil' (nazir 16)", () => {
  it("asks first, with the same question when people use the group, and sends their answer (criterion 4)", async () => {
    await open({ mode: "edit", group: kayit });
    await click(button(dialog(), "Grubu sil"));
    await settle(60);

    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain("Bu grubu 2 kişi kullanıyor");
    expect(ask.textContent).toContain(
      "“Kayıt ve talebe işleri” grubunu siliyorsunuz."
    );
    expect(button(ask, "Grubu sil").disabled).toBe(true);
    await click(
      [...ask.querySelectorAll("[role=radio]")].find((r) =>
        r.closest("label")?.textContent?.includes("İzinleri kaybetsinler")
      ) as Element
    );
    await settle(40);
    await click(button(ask, "Grubu sil"));
    await settle(80);

    expect(removeGroup).toHaveBeenCalledExactlyOnceWith("m-1", "g-1", "revoke");
    expect(toast("success")).toContain("Grup silindi");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("confirms a group nobody uses with no question about people, and sends no answer", async () => {
    await open({ mode: "edit", group: bos });
    await click(button(dialog(), "Grubu sil"));
    await settle(60);
    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain(
      "“Yasak ve itiraz” grubu silinecek. Bu grubu kimse kullanmıyor"
    );
    expect(ask.querySelectorAll("[role=radio]")).toHaveLength(0);
    await click(button(ask, "Grubu sil"));
    await settle(80);
    expect(removeGroup).toHaveBeenCalledExactlyOnceWith(
      "m-1",
      "g-2",
      undefined
    );
  });

  it("asks anyway when the API says people hold a group the list showed as free", async () => {
    removeGroup.mockResolvedValueOnce({
      success: false,
      code: "USERS_POLICY_REQUIRED",
      userCount: 1,
    });
    await open({ mode: "edit", group: bos });
    await click(button(dialog(), "Grubu sil"));
    await settle(60);
    await click(button(question() as HTMLElement, "Grubu sil"));
    await settle(80);
    expect((question() as HTMLElement).textContent).toContain(
      "Bu grubu 1 kişi kullanıyor"
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("closes the question with Vazgeç and deletes nothing", async () => {
    await open({ mode: "edit", group: kayit });
    await click(button(dialog(), "Grubu sil"));
    await settle(60);
    await click(button(question() as HTMLElement, "Vazgeç"));
    await settle(60);
    expect(question()).toBeNull();
    expect(removeGroup).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });
});

describe("the groups under the nazırs (nazir 05, 16)", () => {
  const card = (group: typeof kayit) => ({
    group,
    summary:
      "Başvuruyu onayla ya da reddet · Talebeyi gerekçeyle dersten çıkar",
    usage: "2 izin · 2 nazıra verildi",
  });
  const mountList = (cards = [card(kayit), card(bos)]) =>
    render(
      wrap(
        <PermissionGroups
          madrasahId="m-1"
          madrasahName="Süleymaniye Medresesi"
          cards={cards}
          manages
        />
      )
    );

  it("opens the dialog for a new group from 'Grup tanımla' and for an existing one from 'Düzenle'", async () => {
    loadCatalog.mockResolvedValue(catalog());
    await mountList();
    expect(document.body.textContent).toContain("İzin grupları");
    expect(
      document.querySelectorAll("[data-testid=permission-group]")
    ).toHaveLength(2);

    await click(button(document.body, "Grup tanımla"));
    await settle(80);
    expect(dialog().textContent).toContain("İzin grubu tanımla");
    await click(button(dialog(), "Vazgeç"));
    await settle(80);
    expect(dialog()).toBeNull();

    await click(
      document.querySelector(
        'button[aria-label="Düzenle: Yasak ve itiraz"]'
      ) as Element
    );
    await settle(80);
    expect(dialog().textContent).toContain("İzin grubunu düzenle");
    expect(nameField().value).toBe("Yasak ve itiraz");
  });

  it("reads the page again once a group is saved", async () => {
    loadCatalog.mockResolvedValue(catalog());
    await mountList([]);
    expect(document.body.textContent).toContain(
      "Bu medresenin henüz izin grubu yok."
    );
    await click(button(document.body, "Grup tanımla"));
    await settle(80);
    await typeInto(nameField(), "Ders açma");
    await toggle("Hafta ve celse gizle, geri al");
    await click(button(dialog(), "Grubu kaydet"));
    await settle(100);
    expect(createGroup).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalled();
  });
});
