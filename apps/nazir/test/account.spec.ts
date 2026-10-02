import { resources } from "@medaris/i18n";
import type { EffectivePermissionGroup } from "@medaris/services/tedrisat";
import { describe, expect, it, vi } from "vitest";
import {
  assignmentRows,
  lacksNazirRoles,
  scopeBadge,
  scopeMeta,
  sortAssignments,
} from "~/features/account/assignments-view";
import {
  groupExpiry,
  groupHeading,
  knownCodes,
  PERMISSION_NOTE_CODES,
  permissionMessageKey,
  ROLE_DEFAULTS_NOTE,
  visibleGroups,
} from "~/features/account/permissions";
import {
  COMMON_ZONES,
  commonZoneChoices,
  isCommonZone,
  OTHER_ZONE,
  otherZoneChoices,
  otherZoneLabel,
} from "~/features/account/time-zone";
import { assignment, course, medrese } from "./fixtures";

// The permission codes the API can send (apps/tedrisat permission-catalog.ts).
const CATALOG = [
  "kosk.manage",
  "kosk.hosting",
  "course.open_standalone",
  "course.manage_all",
  "ban.manage_kosk",
  "deck.manage_kosk",
  "course_nazir.assign_kosk",
  "user.lookup",
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
];
const ROLES = [
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
  "MEDRESE_BASMUDERRIS",
  "MEDRESE_NAZIR",
  "MUDERRIS",
  "DERS_NAZIR",
];

const locales = ["tr", "en", "ar"] as const;
const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (n, part) => (n as Record<string, unknown> | undefined)?.[part],
      node
    );

/** A translator over the Turkish catalogue, the way next-intl hands one to a server component. */
const translator = (locale: (typeof locales)[number] = "tr") => {
  const t = (key: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      dig(resources[locale].nazir, key) as string
    );
  t.has = (key: string) =>
    typeof dig(resources[locale].nazir, key) === "string";
  return t;
};

describe("account messages (MDRS-183)", () => {
  for (const locale of locales) {
    const m = resources[locale].nazir as unknown as {
      Roles: Record<string, string>;
      Account: Record<string, Record<string, string>>;
    };

    it(`${locale} has a sentence for every permission code and a name for every role`, () => {
      for (const code of CATALOG) {
        expect(
          m.Account.permissions?.[permissionMessageKey(code)],
          code
        ).toBeTruthy();
      }
      for (const role of ROLES) expect(m.Roles[role], role).toBeTruthy();
      expect(m.Roles.STUDENT).toBeTruthy();
    });

    it(`${locale} has the note of every code that carries one, and the role defaults`, () => {
      for (const code of PERMISSION_NOTE_CODES) {
        expect(
          m.Account.permissionNotes?.[permissionMessageKey(code)],
          code
        ).toBeTruthy();
      }
      for (const role of ROLE_DEFAULTS_NOTE) {
        expect(m.Account.defaultsNote?.[role], role).toBeTruthy();
      }
    });

    it(`${locale} has the four badge states of a scope`, () => {
      for (const state of ["active", "published", "draft", "hidden"]) {
        expect(m.Account.scopeBadge?.[state], state).toBeTruthy();
      }
    });

    it(`${locale} has the three ways a role group can end and the two ways a group is headed`, () => {
      for (const key of [
        "expiryNone",
        "expiryAt",
        "expiryEarliest",
        "eachScope.MUDERRIS",
        "eachScope.default",
        "grantedRole",
      ]) {
        expect(dig(m.Account, key), key).toEqual(expect.any(String));
      }
    });
  }
});

describe("the permission sentences (Turkish)", () => {
  it("say 'siz' where they speak to the person", () => {
    const sentences = Object.values(
      resources.tr.nazir.Account.permissions as Record<string, string>
    ).concat(
      Object.values(
        resources.tr.nazir.Account.permissionNotes as Record<string, string>
      )
    );
    for (const sentence of sentences) {
      // The sen forms, whole words: "izinlerinizi" is the siz form and passes.
      expect(sentence).not.toMatch(
        /(izinlerini|kaldıramazsın|veremezsin)(?![a-zçğıöşü])/
      );
    }
  });
});

describe("the badge of a scope", () => {
  it("is a course's state, and hidden beats published and draft", () => {
    expect(scopeBadge(assignment({ course: course() }))).toBe("published");
    expect(
      scopeBadge(assignment({ course: course({ status: "DRAFT" }) }))
    ).toBe("draft");
    expect(scopeBadge(assignment({ course: course({ hidden: true }) }))).toBe(
      "hidden"
    );
  });

  it("is 'Etkin' for a scope that is not a course and has a name", () => {
    expect(scopeBadge(medrese())).toBe("active");
    expect(
      scopeBadge(assignment({ scopeName: null, scopeType: "platform" }))
    ).toBeNull();
  });
});

describe("the second line of the scope cell", () => {
  it("is the köşk, then the medrese, when there are any", () => {
    expect(scopeMeta(assignment({ course: course() }))).toEqual([
      "Nûruosmaniye Köşkü",
    ]);
    expect(
      scopeMeta(
        assignment({
          course: course({ madrasahName: "Süleymaniye Medresesi" }),
        })
      )
    ).toEqual(["Nûruosmaniye Köşkü", "Süleymaniye Medresesi"]);
    expect(scopeMeta(medrese())).toEqual([]);
  });
});

describe("the list of roles", () => {
  const rows = [
    assignment({ id: "k", scopeType: "kosk", role: "KOSK_NAZIM" }),
    assignment({ id: "c1", scopeType: "course" }),
    medrese({ id: "m" }),
    assignment({ id: "c2", scopeType: "course" }),
  ];

  it("lists the medrese first, then the courses, and the köşk's last, keeping the API's order within a kind", () => {
    expect(sortAssignments(rows).map((a) => a.id)).toEqual([
      "m",
      "c1",
      "c2",
      "k",
    ]);
  });

  it("says the person is neither a medrese nazırı nor a ders nazırı, whatever else they are", () => {
    expect(
      lacksNazirRoles([{ role: "MEDRESE_BASMUDERRIS" }, { role: "MUDERRIS" }])
    ).toBe(true);
    expect(lacksNazirRoles([])).toBe(true);
    expect(lacksNazirRoles([{ role: "MEDRESE_NAZIR" }])).toBe(false);
    expect(
      lacksNazirRoles([{ role: "MUDERRIS" }, { role: "DERS_NAZIR" }])
    ).toBe(false);
  });

  it("words and dates each row in the viewer's zone", () => {
    const day = new Intl.DateTimeFormat("tr", {
      dateStyle: "long",
      timeZone: "Europe/Istanbul",
    });
    const [first, second, third] = assignmentRows(
      [
        medrese({ grantedAt: new Date("2026-09-01T00:30:00Z") }),
        assignment({
          id: "c",
          isImam: true,
          course: course(),
          grantedBySelf: true,
          expiresAt: new Date("2027-01-15T10:00:00Z"),
        }),
        assignment({
          id: "d",
          grantedBy: { id: "u", displayName: null },
        }),
      ],
      translator() as never,
      day
    );
    expect(first).toMatchObject({
      role: "Medrese başmüderrisi",
      scopeTitle: "Süleymaniye Medresesi",
      scopeBadge: { label: "Etkin" },
      grantor: "Yusuf Ziya Ertuğrul",
      grantedAt: { label: "1 Eylül 2026" },
      expires: { label: "Süresiz", iso: null },
    });
    expect(second).toMatchObject({
      role: "Müderris",
      isImam: true,
      scopeBadge: { label: "Yayında", variant: "primary" },
      scopeMeta: ["Nûruosmaniye Köşkü"],
      grantor: "Kendiniz",
      expires: { label: "15 Ocak 2027", iso: "2027-01-15T10:00:00.000Z" },
    });
    expect(third?.grantor).toBe("Bilinmiyor");
  });
});

describe("the permission groups", () => {
  const t = translator() as never;
  const group = (over: Partial<EffectivePermissionGroup> = {}) =>
    ({
      role: "MUDERRIS",
      scopeType: "course",
      scopes: [{ type: "course", id: "c-1", name: "Bina ve İzhar Şerhi" }],
      permissions: ["course.edit", "session.manage"],
      ...over,
    }) as EffectivePermissionGroup;

  it("heads a group of one scope with the scope and the role", () => {
    expect(groupHeading(group(), t, "tr")).toEqual({
      title: "Bina ve İzhar Şerhi · müderris",
      scopeLine: null,
    });
  });

  it("heads a role held in several scopes with the role, and says where it holds", () => {
    const many = group({
      scopes: [
        { type: "course", id: "1", name: "Bina ve İzhar Şerhi" },
        { type: "course", id: "2", name: "İsâgûcî ile mantığa giriş" },
      ],
    });
    expect(groupHeading(many, t, "tr")).toEqual({
      title: "Müderris",
      scopeLine:
        "Müderris olduğunuz derslerin her birinde geçerli: Bina ve İzhar Şerhi ve İsâgûcî ile mantığa giriş.",
    });
    expect(
      groupHeading({ ...many, role: "DERS_NAZIR" }, t, "tr").scopeLine
    ).toBe(
      "Ders nazırı olduğunuz her kapsamda geçerli: Bina ve İzhar Şerhi ve İsâgûcî ile mantığa giriş."
    );
  });

  it("names a group that holds only a grant", () => {
    expect(groupHeading(group({ role: undefined }), t, "tr").title).toBe(
      "Bina ve İzhar Şerhi · verilen izinler"
    );
  });

  it("leaves a code with no sentence out, and a group with none to show", () => {
    const unknown = group({
      permissions: ["madrasah.open_course", "course.edit"],
    });
    expect(knownCodes(unknown, t)).toEqual(["course.edit"]);
    const empty = group({ permissions: ["madrasah.open_course"] });
    expect(visibleGroups([unknown, empty], t).map((v) => v.group)).toEqual([
      unknown,
    ]);
    expect(visibleGroups([], t)).toEqual([]);
  });

  describe("when a role group ends", () => {
    const g = group({
      scopes: [
        { type: "course", id: "c-1", name: "A" },
        { type: "course", id: "c-2", name: "B" },
      ],
    });
    const held = (id: string, expiresAt: Date | null, role = "MUDERRIS") => ({
      role,
      scopeId: id,
      expiresAt,
    });

    it("never, when no assignment of the group has an end date", () => {
      expect(groupExpiry(g, [held("c-1", null), held("c-2", null)])).toEqual({
        kind: "none",
      });
    });

    it("on the date, for one scope", () => {
      const one = group();
      const at = new Date("2027-03-01T00:00:00Z");
      expect(groupExpiry(one, [held("c-1", at)])).toEqual({ kind: "at", at });
    });

    it("on the nearest date, for several", () => {
      const near = new Date("2027-03-01T00:00:00Z");
      const far = new Date("2028-03-01T00:00:00Z");
      expect(groupExpiry(g, [held("c-1", far), held("c-2", near)])).toEqual({
        kind: "earliest",
        at: near,
      });
      // One scope is open-ended, the other ends: the end is still the nearest.
      expect(groupExpiry(g, [held("c-1", null), held("c-2", near)])).toEqual({
        kind: "earliest",
        at: near,
      });
    });

    it("says nothing for a grant-only group or one the assignments do not explain", () => {
      expect(
        groupExpiry(group({ role: undefined }), [held("c-1", null)])
      ).toBeNull();
      expect(groupExpiry(g, [held("elsewhere", null)])).toBeNull();
      expect(groupExpiry(g, [held("c-1", null, "DERS_NAZIR")])).toBeNull();
    });
  });
});

describe("the time zone lists (nazir 20)", () => {
  it("offers the eight course zones of the canvas in its order, then 'Diğer…'", () => {
    const choices = commonZoneChoices("Diğer…");
    expect(choices.map((c) => c.label)).toEqual([
      "İstanbul",
      "Berlin",
      "Amsterdam",
      "Brüksel",
      "Paris",
      "Viyana",
      "Londra",
      "New York",
      "Diğer…",
    ]);
    expect(choices.at(-1)?.value).toBe(OTHER_ZONE);
    expect(COMMON_ZONES).not.toContain(OTHER_ZONE);
  });

  it("opens the full list in a second select, without the zones the first has", () => {
    const all = [
      "Europe/Istanbul",
      "Asia/Tokyo",
      "America/Argentina/Buenos_Aires",
    ];
    expect(otherZoneChoices(all)).toEqual([
      { value: "Asia/Tokyo", label: "Asia / Tokyo" },
      {
        value: "America/Argentina/Buenos_Aires",
        label: "America / Argentina / Buenos Aires",
      },
    ]);
    expect(otherZoneLabel("Etc/GMT+3")).toBe("Etc / GMT+3");
    expect(isCommonZone("Europe/Berlin")).toBe(true);
    expect(isCommonZone("Asia/Tokyo")).toBe(false);
  });
});

describe("updateTimeZone", () => {
  const run = async (
    zone: string,
    outcome: { success: boolean; error?: string } = { success: true }
  ) => {
    vi.resetModules();
    const updateMe = vi.fn().mockResolvedValue({});
    vi.doMock("~/lib/authenticated-action", () => ({
      authenticatedAction: vi.fn(async (action: (api: unknown) => unknown) => {
        if (outcome.success) await action({ me: { updateMe } });
        return outcome.success ? { success: true, data: {} } : outcome;
      }),
    }));
    const { updateTimeZone } = await import("~/features/account/actions");
    return { result: await updateTimeZone(zone), updateMe };
  };

  it("patches /me with the zone and says it worked", async () => {
    const { result, updateMe } = await run("America/New_York");
    expect(result).toEqual({ success: true });
    expect(updateMe).toHaveBeenCalledWith({
      updateMeDto: { timeZone: "America/New_York" },
    });
  });

  it("does not call the API for a name that is not a zone", async () => {
    const { result, updateMe } = await run("Mars/Olympus_Mons");
    expect(result).toEqual({ success: false });
    expect(updateMe).not.toHaveBeenCalled();
  });

  it("says it failed, and not why, when the API refuses", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await run("Europe/Berlin", {
      success: false,
      error: "internal detail",
    });
    expect(result).toEqual({ success: false });
    quiet.mockRestore();
  });
});
