// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppointCourseNazir,
  CourseNazirDialog,
} from "~/features/course-nazirs/components/course-nazir-dialog";
import { EndCourseNazir } from "~/features/course-nazirs/components/end-course-nazir";
import type {
  CourseNazirRow,
  CourseNazirsContext,
} from "~/features/course-nazirs/course-nazirs";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";

/**
 * The dialogs of Ders nazırları (MDRS-270): "Ders nazırı ata", "İzinleri
 * düzenle" and "Görevden al". The actions and the search are stubs; what is
 * under test is what each dialog sends, what it refuses before sending, and
 * what it does with the API's answer.
 */
const refresh = vi.fn();
const lookupPerson = vi.fn();
const appointCourseNazir = vi.fn();
const changeCourseNazir = vi.fn();
const endCourseNazir = vi.fn();
const onClose = vi.fn();
const onDone = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/nazirs/actions", () => ({
  lookupPerson: (email: string) => lookupPerson(email),
}));
vi.mock("~/features/course-nazirs/actions", () => ({
  appointCourseNazir: (...args: unknown[]) => appointCourseNazir(...args),
  changeCourseNazir: (...args: unknown[]) => changeCourseNazir(...args),
  endCourseNazir: (...args: unknown[]) => endCourseNazir(...args),
}));

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const CATALOG = [
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
  "deck.propose_kosk",
  "course_nazir.assign",
];
const SESSION =
  "Celse ekle, tarihini değiştir, iptal et; toplantı bağlantısını gir";
const RECORDING = "Ders kaydı ekle, adlandır, gizle; görünürlüğünü değiştir";
const EDIT = "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi";
const PUBLISH = "Dersi yayımla ya da taslağa çek";

/** A müderris on a course where a policy took `course.publish` from him. */
const context = (
  over: Partial<CourseNazirsContext> = {}
): CourseNazirsContext => ({
  courseId: "c-1",
  courseTitle: "Bina ve İzhar Şerhi",
  catalog: CATALOG,
  grantable: CATALOG.filter((code) => code !== "course.publish"),
  timeZone: "Europe/Istanbul",
  viewerId: "u-0",
  holders: ["u-1"],
  ...over,
});

const fatma: CourseNazirRow = {
  id: "p-1",
  userId: "u-1",
  name: "Fatma Zehra Çelebioğlu",
  email: "fz@example.com",
  codes: ["session.manage", "course.publish"],
  count: "2 izin",
  permissionsLine: `${SESSION} · ${PUBLISH}`,
  ends: { label: "31 Aralık 2026", iso: "2026-12-31T20:59:59.000Z" },
  giver: {
    name: "Mehmet Emin Işıkoğlu",
    isYou: true,
    at: { label: "30 Eylül 2026", iso: "2026-09-30T09:00:00.000Z" },
  },
  appointedLine: "Atayan: Mehmet Emin Işıkoğlu · 30 Eylül 2026",
  isYou: false,
  mayEdit: true,
  mayEnd: true,
  appointees: 0,
};

const found = (id = "u-9") => ({
  kind: "found",
  person: {
    id,
    name: "Abdullah Talha Erzurumluoğlu",
    email: "a.erzurumluoglu@example.com",
  },
});

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const button = (label: string, root: ParentNode = dialog()) =>
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
const locked = (sentence: string) =>
  box(sentence).getAttribute("aria-disabled") === "true" ||
  box(sentence).hasAttribute("disabled") ||
  box(sentence).hasAttribute("data-disabled");
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const emailField = () =>
  document.querySelector("input[type=email]") as HTMLInputElement;
const dateField = () =>
  dialog().querySelector("input[type=datetime-local]") as HTMLInputElement;
const save = async () => {
  await click(button("Kaydet"));
  await settle(60);
};

beforeEach(() => {
  for (const fn of [
    refresh,
    lookupPerson,
    appointCourseNazir,
    changeCourseNazir,
    endCourseNazir,
    onClose,
    onDone,
  ]) {
    fn.mockReset();
  }
  appointCourseNazir.mockResolvedValue({ success: true, data: null });
  changeCourseNazir.mockResolvedValue({ success: true, data: null });
  endCourseNazir.mockResolvedValue({ success: true, data: null });
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("'Ders nazırı ata'", () => {
  const open = async (over: Partial<CourseNazirsContext> = {}) => {
    await render(wrap(<AppointCourseNazir context={context(over)} />));
    await click(button("Ders nazırı ata", document.body));
    await settle(60);
  };
  const search = async (address: string) => {
    await typeInto(emailField(), address);
    await key(emailField(), "Enter");
    await settle(40);
  };
  const pick = async (over: Partial<CourseNazirsContext> = {}) => {
    lookupPerson.mockResolvedValue(found());
    await open(over);
    await search("a.erzurumluoglu@example.com");
  };

  it("opens for the course, in the e-mail field, with no way to save yet", async () => {
    await open();
    expect(dialog().textContent).toContain("Bina ve İzhar Şerhi");
    expect(dialog().textContent).toContain("Ders nazırı ata");
    expect(dialog().textContent).toContain(
      "Her arama denetim kaydına yazılır."
    );
    expect(document.activeElement).toBe(emailField());
    expect(button("Kaydet").disabled).toBe(true);
  });

  it("searches an exact address on Enter, never on a key, and not text that is no address", async () => {
    lookupPerson.mockResolvedValue(found());
    await open();
    await typeInto(emailField(), "abdullah");
    await key(emailField(), "Enter");
    await settle(40);
    expect(lookupPerson).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain("Geçerli bir e-posta adresi yazın.");

    await typeInto(emailField(), "a.erzurumluoglu@example.com");
    expect(lookupPerson).not.toHaveBeenCalled();
    await key(emailField(), "Enter");
    await settle(40);
    expect(lookupPerson).toHaveBeenCalledExactlyOnceWith(
      "a.erzurumluoglu@example.com"
    );
    const chosen = document.querySelector("[data-testid=chosen-course-nazir]");
    expect(chosen?.textContent).toContain("Abdullah Talha Erzurumluoğlu");
    expect(chosen?.textContent).toContain("a.erzurumluoglu@example.com");
    expect(button("Kaydet").disabled).toBe(false);
  });

  it("says so when no account has the address, and when the directory cannot be reached", async () => {
    lookupPerson.mockResolvedValue({ kind: "none" });
    await open();
    await search("kimse@example.com");
    expect(dialog().textContent).toContain("Bu adresle bir hesap bulunamadı.");
    expect(button("Kaydet").disabled).toBe(true);

    lookupPerson.mockResolvedValue({ kind: "unavailable" });
    await search("baska@example.com");
    expect(dialog().textContent).toContain(
      "Arama şu an yapılamıyor. Biraz sonra yeniden deneyin."
    );
  });

  it("refuses the viewer and someone who holds a post here already, before sending", async () => {
    lookupPerson.mockResolvedValue(found("U-0"));
    await open();
    await search("ben@example.com");
    expect(dialog().textContent).toContain(
      "Kendinizi ders nazırı yapamazsınız."
    );
    expect(button("Kaydet").disabled).toBe(true);

    await click(button("Başka birini seç"));
    lookupPerson.mockResolvedValue(found("u-1"));
    await search("fz@example.com");
    expect(dialog().textContent).toContain(
      "Abdullah Talha Erzurumluoğlu bu dersin ders nazırı zaten."
    );
    expect(button("Kaydet").disabled).toBe(true);
    await save();
    expect(appointCourseNazir).not.toHaveBeenCalled();
  });

  it("appoints with the codes ticked and no end, says so, and reads the list again", async () => {
    await pick();
    await toggle(RECORDING);
    await toggle(SESSION);
    expect(dialog().textContent).toContain("2 izin seçili");
    await save();
    expect(appointCourseNazir).toHaveBeenCalledExactlyOnceWith("c-1", {
      userId: "u-9",
      permissions: ["session.manage", "recording.manage"],
    });
    expect(toast("success")).toContain("Ders nazırı atandı");
    expect(toast("success")).toContain(
      "Abdullah Talha Erzurumluoğlu bu dersin ders nazırı oldu."
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("leaves a box the caller may not give off", async () => {
    await pick();
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(20);
    expect(locked(PUBLISH)).toBe(true);
    expect(locked(SESSION)).toBe(false);
    await toggle(PUBLISH);
    expect(checked(PUBLISH)).toBe(false);
  });

  it("draws no box for one who appoints only, and sends no permission", async () => {
    await pick({ grantable: [] });
    expect(dialog().querySelectorAll("[role=checkbox]")).toHaveLength(0);
    expect(
      document.querySelector("[data-testid=appoint-only]")?.textContent
    ).toBe("Atadığınız kişi izinsiz başlar; izinleri dersin müderrisi verir.");
    await save();
    expect(appointCourseNazir).toHaveBeenCalledExactlyOnceWith("c-1", {
      userId: "u-9",
      permissions: [],
    });
  });

  it("refuses a moment not after now, and sends the moment typed on the viewer's clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
    await pick();
    expect(dateField().type).toBe("datetime-local");
    await typeInto(dateField(), "2026-10-05T09:59");
    await save();
    expect(dialog().textContent).toContain(
      "Bitiş zamanı şu andan sonra olmalı."
    );
    expect(appointCourseNazir).not.toHaveBeenCalled();

    await typeInto(dateField(), "2026-12-31T23:59");
    await save();
    expect(appointCourseNazir).toHaveBeenCalledExactlyOnceWith("c-1", {
      userId: "u-9",
      permissions: [],
      endsAt: "2026-12-31T20:59:00.000Z",
    });
  });

  it("reads the end on the viewer's own zone, not Istanbul's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
    await pick({ timeZone: "America/New_York" });
    await typeInto(dateField(), "2026-12-31T23:59");
    await save();
    expect(appointCourseNazir).toHaveBeenCalledExactlyOnceWith("c-1", {
      userId: "u-9",
      permissions: [],
      endsAt: "2027-01-01T04:59:00.000Z",
    });
  });

  it("refuses an end left half typed, even when the field was never left", async () => {
    await pick();
    // A datetime-local field keeps "" until every segment is filled and says
    // so in validity.badInput; happy-dom has no widget, so it is set by hand.
    Object.defineProperty(dateField(), "validity", {
      configurable: true,
      get: () => ({ badInput: true }),
    });
    await save();
    expect(dialog().textContent).toContain(
      "Bitiş tarihini ve saatini tamamlayın."
    );
    expect(appointCourseNazir).not.toHaveBeenCalled();
  });

  it("keeps the dialog and words a refusal from its code", async () => {
    appointCourseNazir.mockResolvedValue({
      success: false,
      code: "COURSE_NAZIR_HOLDS_SEAT",
    });
    await pick();
    await save();
    expect(toast("error")).toContain("Ders nazırı atanamadı");
    expect(toast("error")).toContain(
      "Bu kişinin bu derste zaten bir görevi var"
    );
    expect(dialog()).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes and reads the list again when the person became a ders nazırı meanwhile", async () => {
    appointCourseNazir.mockResolvedValue({
      success: false,
      code: "COURSE_NAZIR_EXISTS",
    });
    await pick();
    await save();
    expect(toast("error")).toContain("Bu kişi bu dersin ders nazırı zaten.");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("writes nothing on Vazgeç, and forgets the person when it opens again", async () => {
    await pick();
    await click(button("Vazgeç"));
    await settle(60);
    expect(dialog()).toBeNull();
    expect(appointCourseNazir).not.toHaveBeenCalled();
    await click(button("Ders nazırı ata", document.body));
    await settle(60);
    expect(
      document.querySelector("[data-testid=chosen-course-nazir]")
    ).toBeNull();
    expect(emailField().value).toBe("");
  });
});

describe("'İzinleri düzenle'", () => {
  const open = async (
    post: CourseNazirRow = fatma,
    over: Partial<CourseNazirsContext> = {}
  ) => {
    await render(
      wrap(
        <CourseNazirDialog
          open
          row={post}
          context={context(over)}
          onClose={onClose}
          onDone={onDone}
        />
      )
    );
    await settle(60);
  };

  it("opens with the person, what the post holds and its end on the viewer's clock", async () => {
    await open();
    expect(dialog().textContent).toContain("İzinleri düzenle");
    expect(dialog().textContent).toContain("Fatma Zehra Çelebioğlu");
    expect(dialog().textContent).toContain(
      "Ders nazırı · Atayan: Mehmet Emin Işıkoğlu · 30 Eylül 2026"
    );
    expect(document.querySelector("input[type=email]")).toBeNull();
    expect(checked(SESSION)).toBe(true);
    expect(checked(PUBLISH)).toBe(true);
    expect(checked(RECORDING)).toBe(false);
    expect(dateField().value).toBe("2026-12-31T23:59");
  });

  it("lets a held code the caller could not give be unticked, and sends the whole set left", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T10:00:00+03:00"));
    await open();
    expect(locked(PUBLISH)).toBe(false);
    await toggle(PUBLISH);
    await toggle(EDIT);
    await save();
    // the end, untouched, goes back as the instant the API holds, seconds and all
    expect(changeCourseNazir).toHaveBeenCalledExactlyOnceWith("c-1", "p-1", {
      permissions: ["course.edit", "session.manage"],
      endsAt: "2026-12-31T20:59:59.000Z",
    });
    expect(toast("success")).toContain("İzinler kaydedildi");
    expect(toast("success")).toContain(
      "Fatma Zehra Çelebioğlu için izinler güncellendi."
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("sends `null` when the end is emptied on purpose", async () => {
    await open();
    await typeInto(dateField(), "");
    await save();
    expect(changeCourseNazir).toHaveBeenCalledExactlyOnceWith("c-1", "p-1", {
      permissions: ["session.manage", "course.publish"],
      endsAt: null,
    });
  });

  it("closes without writing when nothing changed", async () => {
    await open();
    await toggle(RECORDING);
    await toggle(RECORDING);
    await save();
    expect(changeCourseNazir).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("keeps the dialog and words a refusal", async () => {
    changeCourseNazir.mockResolvedValue({
      success: false,
      code: "GRANT_EXCEEDS_GIVER",
    });
    await open();
    await toggle(RECORDING);
    await save();
    expect(toast("error")).toContain("İzinler kaydedilemedi");
    expect(toast("error")).toContain(
      "Kendinizde olmayan bir izni veremezsiniz."
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("closes and reads the list again when the post is gone", async () => {
    changeCourseNazir.mockResolvedValue({
      success: false,
      code: "COURSE_NAZIR_NOT_FOUND",
    });
    await open();
    await toggle(RECORDING);
    await save();
    expect(toast("error")).toContain(
      "Bu ders nazırı artık yok; liste yenilendi."
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("writes nothing on Vazgeç", async () => {
    await open();
    await toggle(RECORDING);
    await click(button("Vazgeç"));
    await settle(40);
    expect(onClose).toHaveBeenCalled();
    expect(changeCourseNazir).not.toHaveBeenCalled();
  });

  it("starts again from what the post holds on every opening", async () => {
    /** The table's part: it shuts the dialog on Vazgeç and opens it on a row. */
    function Table() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            aç
          </button>
          <CourseNazirDialog
            open={open}
            row={fatma}
            context={context()}
            onClose={() => setOpen(false)}
            onDone={onDone}
          />
        </>
      );
    }
    await render(wrap(<Table />));
    await settle(60);
    await toggle(RECORDING);
    await typeInto(dateField(), "");
    expect(checked(RECORDING)).toBe(true);
    await click(button("Vazgeç"));
    await settle(60);
    await click(button("aç", document.body));
    await settle(60);
    expect(checked(RECORDING)).toBe(false);
    expect(dateField().value).toBe("2026-12-31T23:59");
  });
});

describe("'Görevden al'", () => {
  const open = async (post: CourseNazirRow | null = fatma) => {
    await render(
      wrap(
        <EndCourseNazir
          courseId="c-1"
          courseTitle="Bina ve İzhar Şerhi"
          row={post}
          onClose={onClose}
          onDone={onDone}
        />
      )
    );
    await settle(60);
  };

  it("asks first, names the person and the course, and starts on 'Vazgeç'", async () => {
    await open();
    expect(dialog().textContent).toContain(
      "Fatma Zehra Çelebioğlu, Bina ve İzhar Şerhi dersindeki ders nazırlığından alınacak."
    );
    expect(dialog().textContent).toContain(
      "Görev ve bütün izinleri aynı anda biter."
    );
    expect(dialog().textContent).toContain(
      "Görevden alma denetim kaydına yazılır."
    );
    expect(document.activeElement).toBe(button("Vazgeç"));
  });

  it("writes nothing on Vazgeç", async () => {
    await open();
    await click(button("Vazgeç"));
    await settle(40);
    expect(onClose).toHaveBeenCalled();
    expect(endCourseNazir).not.toHaveBeenCalled();
  });

  it("ends the post, says so and reads the list again", async () => {
    await open();
    await click(button("Görevden al"));
    await settle(60);
    expect(endCourseNazir).toHaveBeenCalledExactlyOnceWith("c-1", "p-1");
    expect(toast("success")).toContain("Görevden alındı");
    expect(toast("success")).toContain(
      "Fatma Zehra Çelebioğlu artık Bina ve İzhar Şerhi dersinin ders nazırı değil."
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("says who must go first when the ders nazırı's appointees still hold their posts, and reads the list again", async () => {
    endCourseNazir.mockResolvedValue({
      success: false,
      code: "DISMISS_SEAT_HANDED_ON",
    });
    await open();
    await click(button("Görevden al"));
    await settle(60);
    expect(toast("error")).toContain("Görevden alınamadı");
    expect(toast("error")).toContain(
      "Bu ders nazırının atadığı ders nazırları var; önce onları görevden alın."
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("keeps the dialog and words any other refusal", async () => {
    endCourseNazir.mockResolvedValue({
      success: false,
      code: "NAZIR_NOT_APPOINTED_BY_YOU",
    });
    await open();
    await click(button("Görevden al"));
    await settle(60);
    expect(toast("error")).toContain(
      "Yalnız kendi atadığınız ders nazırlarını görevden alabilirsiniz."
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
