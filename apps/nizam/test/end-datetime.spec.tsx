// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  KoskGrantResponse,
  MedarisNazimResponse,
  PermissionCatalogResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrantDialog } from "~/features/grants/components/grant-dialog";
import { AssignScopeDialog } from "~/features/inactive-scopes/components/assign-scope-dialog";
import { AddNazimDialog } from "~/features/kosks/components/add-nazim-dialog";
import { AssignHeadDialog } from "~/features/madrasahs/components/assign-head-dialog";
import { PermissionsDialog } from "~/features/permissions/components/permissions-dialog";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";

// MDRS-254: every end of a role or a permission is a date and a time, read in
// the zone the screen shows moments in and compared as an instant. A dialog
// is mounted, the picker is looked for and the request it makes is read.

const appointNazim = vi.fn();
const setNazimGrants = vi.fn();
const createGrant = vi.fn();
const updateGrant = vi.fn();
const assignScope = vi.fn();
const addKoskNazims = vi.fn();
const setHeadMuderris = vi.fn();
const getHeadDelegations = vi.fn();
const lookupUserByEmail = vi.fn();

vi.mock("~/features/permissions/actions", () => ({
  appointNazim: (...a: unknown[]) => appointNazim(...a),
  setNazimGrants: (...a: unknown[]) => setNazimGrants(...a),
}));
vi.mock("~/features/grants/actions", () => ({
  createGrant: (...a: unknown[]) => createGrant(...a),
  updateGrant: (...a: unknown[]) => updateGrant(...a),
}));
vi.mock("~/features/inactive-scopes/actions", () => ({
  assignScope: (...a: unknown[]) => assignScope(...a),
}));
vi.mock("~/features/kosks/admin-actions", () => ({
  addKoskNazims: (...a: unknown[]) => addKoskNazims(...a),
}));
vi.mock("~/features/madrasahs/actions", () => ({
  lookupUserByEmail: (...a: unknown[]) => lookupUserByEmail(...a),
  getHeadDelegations: (...a: unknown[]) => getHeadDelegations(...a),
  setHeadMuderris: (...a: unknown[]) => setHeadMuderris(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// The end MDRS-254 was found with: the last second of a Turkish day.
const END = "2026-12-31T20:59:59.000Z";
const NOW = "2026-10-05T10:00:00+03:00";

// UTC+1, UTC+2, UTC+3 and UTC-8 in December, and what each shows for END.
const ZONES = [
  ["UTC+1", "Europe/Berlin", "2026-12-31T21:59", "2026-12-31T22:00"],
  ["UTC+2", "Europe/Athens", "2026-12-31T22:59", "2026-12-31T23:00"],
  ["UTC+3", "Europe/Istanbul", "2026-12-31T23:59", "2027-01-01T00:00"],
  ["UTC-8", "America/Los_Angeles", "2026-12-31T12:59", "2026-12-31T13:00"],
] as const;

const wrap = (timeZone: string, node: ReactElement) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone={timeZone}
    messages={{ nizam: resources.tr.nizam } as never}
  >
    {node}
  </NextIntlClientProvider>
);

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const picker = () =>
  dialog().querySelector(
    "input[type=datetime-local]"
  ) as HTMLInputElement | null;
const submit = () =>
  dialog().querySelector("button[type=submit]") as HTMLButtonElement;
const send = async () => {
  await click(submit());
  await settle(80);
};
const emailField = () =>
  dialog().querySelector("input[type=email]") as HTMLInputElement;
/** Looks the person up the way the picker does: the address, then Enter. */
const pick = async (id: string, name: string) => {
  lookupUserByEmail.mockResolvedValue({
    kind: "found",
    user: { id, name, email: "kisi@example.com" },
  });
  await typeInto(emailField(), "kisi@example.com");
  await key(emailField(), "Enter");
  await settle(60);
};

const sentTime = (d: unknown) => (d as Date).toISOString();

beforeEach(() => {
  for (const fn of [
    appointNazim,
    setNazimGrants,
    createGrant,
    updateGrant,
    assignScope,
    addKoskNazims,
    setHeadMuderris,
    getHeadDelegations,
    lookupUserByEmail,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue({ success: true, data: null });
  }
  getHeadDelegations.mockResolvedValue({ success: true, data: [] });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

// ---- İzinleri düzenle (Medaris nazımı) ------------------------------------

const catalog: PermissionCatalogResponse = {
  platform: [{ id: "kosks", permissions: ["platform.kosk_create"] }],
  course: ["course.edit"],
};

const nazim: MedarisNazimResponse = {
  user: { id: "u1", name: "Hasan Basri Gündoğdu", email: "h@example.com" },
  appointedBy: { id: "a", name: "Yusuf Ziya Ertuğrul", email: null },
  appointedAt: new Date("2026-09-14T09:00:00Z"),
  assignmentExpiresAt: new Date(END),
  expiresAt: new Date(END),
  groups: [],
  permissions: [{ code: "platform.kosk_create", grantedAt: new Date() }],
};

const openPermissions = async (
  timeZone: string,
  over: Partial<MedarisNazimResponse> = {}
) =>
  render(
    wrap(
      timeZone,
      <PermissionsDialog
        open
        onOpenChange={vi.fn()}
        nazim={{ ...nazim, ...over }}
        catalog={catalog}
        groups={[]}
      />
    )
  ).then(() => settle(40));

describe("Medaris nazımı: İzinleri düzenle", () => {
  it.each(
    ZONES
  )("%s: shows the stored end in a date-and-time picker and saves it untouched", async (_name, zone, shown) => {
    await openPermissions(zone);
    expect(picker()).not.toBeNull();
    expect(picker()?.value).toBe(shown);
    expect(submit().disabled).toBe(false);
    await send();
    expect(setNazimGrants).toHaveBeenCalledOnce();
    const body = setNazimGrants.mock.calls[0]?.[1] as { expiresAt: Date };
    expect(sentTime(body.expiresAt)).toBe(END);
  });

  it.each(
    ZONES
  )("%s: refuses the minute after the appointment's end, before sending", async (_name, zone, _shown, after) => {
    await openPermissions(zone);
    await typeInto(picker() as Element, after);
    expect(dialog().textContent).toContain("Bitiş zamanı atamanın bitişinden");
    expect(submit().disabled).toBe(true);
    await send();
    expect(setNazimGrants).not.toHaveBeenCalled();
  });

  it("refuses a moment that is not after now, accepts a minute later, and sends the typed instant", async () => {
    await openPermissions("Europe/Istanbul");
    await typeInto(picker() as Element, "2026-10-05T10:00");
    expect(dialog().textContent).toContain(
      "Bitiş zamanı şu andan sonra olmalı."
    );
    expect(submit().disabled).toBe(true);
    await typeInto(picker() as Element, "2026-10-05T10:01");
    expect(dialog().textContent).not.toContain("şu andan sonra olmalı");
    await send();
    const body = setNazimGrants.mock.calls[0]?.[1] as { expiresAt: Date };
    expect(sentTime(body.expiresAt)).toBe("2026-10-05T07:01:00.000Z");
  });

  it("clears the end when the picker is emptied", async () => {
    await openPermissions("Europe/Istanbul", { assignmentExpiresAt: null });
    await typeInto(picker() as Element, "");
    await send();
    const body = setNazimGrants.mock.calls[0]?.[1] as { expiresAt: unknown };
    expect(body.expiresAt).toBeNull();
  });
});

// ---- Ders nazırı ata / İzinleri düzenle (köşk) ----------------------------

const grant: KoskGrantResponse = {
  id: "p1",
  user: { id: "u1", name: "Yusuf Kerem Aydınoğlu", email: "y@example.com" },
  course: { id: "c1", title: "Emsile ve Bina", madrasahName: null },
  permissions: ["session.manage", "week.hide"],
  endsAt: new Date(END),
  grantedBy: { id: "me", name: "Abdülhamit Karaosmanoğlu", email: null },
  grantedAt: new Date("2026-09-14T09:00:00Z"),
};

const openGrant = (timeZone: string, over: Partial<KoskGrantResponse> = {}) =>
  render(
    wrap(
      timeZone,
      <GrantDialog
        open
        onOpenChange={vi.fn()}
        koskId="k1"
        grant={{ ...grant, ...over }}
        courses={[]}
        grantable={["session.manage", "week.hide"]}
      />
    )
  ).then(() => settle(40));

describe("Ders nazırı: İzinleri düzenle", () => {
  it.each(
    ZONES
  )("%s: shows the stored end in a date-and-time picker and saves it untouched", async (_name, zone, shown) => {
    await openGrant(zone);
    expect(picker()?.value).toBe(shown);
    await send();
    expect(updateGrant).toHaveBeenCalledOnce();
    const body = updateGrant.mock.calls[0]?.[2] as { endsAt: Date };
    expect(sentTime(body.endsAt)).toBe(END);
  });

  it("refuses a past moment on the screen and sends a later one as typed", async () => {
    await openGrant("America/Los_Angeles");
    await typeInto(picker() as Element, "2026-10-04T23:59");
    expect(dialog().textContent).toContain(
      "Bitiş zamanı şu andan sonra olmalı."
    );
    expect(submit().disabled).toBe(true);
    await typeInto(picker() as Element, "2026-12-01T09:30");
    await send();
    const body = updateGrant.mock.calls[0]?.[2] as { endsAt: Date };
    expect(sentTime(body.endsAt)).toBe("2026-12-01T17:30:00.000Z");
  });
});

// ---- Başmüderris ata -------------------------------------------------------

describe("Başmüderris ata", () => {
  const open = (timeZone: string) =>
    render(
      wrap(
        timeZone,
        <AssignHeadDialog
          open
          onOpenChange={vi.fn()}
          target={{ id: "m1", name: "Zeyrek Medresesi" }}
        />
      )
    ).then(() => settle(40));

  it("asks for a date and a time, refuses a past moment and sends the typed instant", async () => {
    await open("Europe/Berlin");
    expect(picker()).not.toBeNull();
    await pick("u9", "Abdurrahman Şeref Tunalıoğlu");
    expect(submit().disabled).toBe(false);
    await typeInto(picker() as Element, "2026-10-05T08:59");
    expect(dialog().textContent).toContain(
      "Bitiş zamanı şu andan sonra olmalı."
    );
    expect(submit().disabled).toBe(true);
    await typeInto(picker() as Element, "2026-12-31T21:59");
    await send();
    expect(setHeadMuderris).toHaveBeenCalledOnce();
    const body = setHeadMuderris.mock.calls[0]?.[2] as { endsAt: Date };
    expect(setHeadMuderris.mock.calls[0]?.[1]).toBe("u9");
    expect(sentTime(body.endsAt)).toBe("2026-12-31T20:59:00.000Z");
  });

  it("sends no end when the picker is left empty", async () => {
    await open("Europe/Berlin");
    await pick("u9", "Abdurrahman Şeref Tunalıoğlu");
    await send();
    expect(setHeadMuderris.mock.calls[0]?.[2]).toEqual({});
  });
});

// ---- Pasif kapsamlar: ata --------------------------------------------------

describe("Pasif kapsamlar: Köşk nazımı ata", () => {
  const open = (timeZone: string) =>
    render(
      wrap(
        timeZone,
        <AssignScopeDialog
          open
          onOpenChange={vi.fn()}
          target={
            {
              type: "KOSK",
              id: "k1",
              name: "Beyazıt Köşkü",
            } as never
          }
        />
      )
    ).then(() => settle(40));

  it("asks for a date and a time, refuses a past moment and sends the typed instant", async () => {
    await open("America/Los_Angeles");
    expect(picker()).not.toBeNull();
    await pick("u9", "Fatma Zehra Çelebioğlu");
    await typeInto(picker() as Element, "2026-10-05T00:00");
    expect(dialog().textContent).toContain(
      "Bitiş zamanı şu andan sonra olmalı."
    );
    expect(submit().disabled).toBe(true);
    await typeInto(picker() as Element, "2026-12-31T12:59");
    await send();
    expect(assignScope).toHaveBeenCalledOnce();
    expect(assignScope.mock.calls[0]?.slice(0, 3)).toEqual([
      "KOSK",
      "k1",
      "u9",
    ]);
    expect(sentTime(assignScope.mock.calls[0]?.[3])).toBe(
      "2026-12-31T20:59:00.000Z"
    );
  });
});

// ---- Köşk nazımı ekle ------------------------------------------------------

describe("Köşk nazımı ekle", () => {
  const open = (timeZone: string) =>
    render(
      wrap(
        timeZone,
        <AddNazimDialog
          open
          onOpenChange={vi.fn()}
          koskId="k1"
          koskName="Beyazıt Köşkü"
        />
      )
    ).then(() => settle(40));

  it("asks for a date and a time, refuses a moment of today that has gone and sends a later one", async () => {
    await open("Europe/Istanbul");
    expect(picker()).not.toBeNull();
    await pick("u9", "Fatma Zehra Çelebioğlu");
    // Today, an hour ago: the old screen compared days and let it through.
    await typeInto(picker() as Element, "2026-10-05T09:00");
    expect(dialog().textContent).toContain(
      "Bitiş zamanı şu andan sonra olmalı."
    );
    expect(submit().disabled).toBe(true);
    await typeInto(picker() as Element, "2026-10-05T18:00");
    await send();
    expect(addKoskNazims).toHaveBeenCalledOnce();
    expect(addKoskNazims.mock.calls[0]).toEqual([
      "k1",
      ["u9"],
      "2026-10-05T15:00:00.000Z",
    ]);
  });
});
