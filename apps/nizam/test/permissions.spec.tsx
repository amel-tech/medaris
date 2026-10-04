import { resources } from "@medaris/i18n";
import type {
  GivenItemResponse,
  GroupUserResponse,
  MedarisNazimResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupsView } from "~/features/permissions/components/groups-view";
import { NazimsView } from "~/features/permissions/components/nazims-view";
import {
  catalogFor,
  codeKey,
  type DecisionItem,
  dayIn,
  daysLeft,
  decisionItems,
  dismissDecisions,
  dismissReady,
  endLabel,
  extrasToSend,
  formatDay,
  givenKey,
  groupItems,
  groupNameError,
  keepAllowed,
  needsUsersQuestion,
  orderByCatalog,
  permissionErrorKey,
  platformGroupOf,
  selfMadeItems,
  summaryCounts,
  toggleExtra,
  withoutGroupCodes,
} from "~/features/permissions/present";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/permissions/actions", () => ({
  appointNazim: vi.fn(),
  setNazimGrants: vi.fn(),
  getGivenItems: vi.fn(),
  dismissNazim: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
}));
vi.mock("~/features/madrasahs/actions", () => ({
  lookupUserByEmail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const IST = "Europe/Istanbul";

describe("codes and messages", () => {
  it("turns a code into a message key that does not nest", () => {
    expect(codeKey("platform.kosk_create")).toBe("platform_kosk_create");
  });

  it("has a sentence for every platform code of the catalog the API serves, in all three languages", () => {
    const codes = [
      "platform.kosk_create",
      "platform.kosk_nazim_manage",
      "platform.kosk_edit",
      "platform.course_hide",
      "platform.hosting_grant",
      "platform.madrasah_create",
      "platform.head_muderris_manage",
      "platform.madrasah_edit",
      "platform.madrasah_nazir_grant",
      "platform.kosk_application_decide",
      "platform.deck_publish",
      "platform.appeal_decide",
      "platform.ban_scoped",
      "platform.ban_account",
      "platform.audit_read",
      "platform.inactive_scopes_manage",
      "platform.youtube_manage",
      "platform.policy_edit",
    ];
    for (const lang of ["tr", "en", "ar"] as const) {
      const catalog = (
        resources[lang].nizam as unknown as {
          PermissionCatalog: {
            permissions: Record<string, { title: string; short: string }>;
            course: Record<string, string>;
          };
        }
      ).PermissionCatalog;
      for (const code of codes) {
        const entry = catalog.permissions[codeKey(code)];
        expect(entry?.title, `${lang} ${code}`).toBeTruthy();
        expect(entry?.short, `${lang} ${code}`).toBeTruthy();
      }
      // The 18 course permissions of nizam/13 and the owner's 1 October entry
      // "propose a köşk deck".
      expect(Object.keys(catalog.course)).toHaveLength(19);
    }
  });
});

describe("the end of a permission (nizam 11 criterion 2)", () => {
  const now = new Date("2026-10-01T09:00:00Z");
  const opts = { locale: "tr", timeZone: IST };

  it("counts calendar days in the viewer's zone", () => {
    expect(daysLeft(new Date("2026-10-15T20:59:59Z"), now, IST)).toBe(14);
    expect(daysLeft(new Date("2026-10-01T20:59:59Z"), now, IST)).toBe(0);
    // 22:30 UTC on the 14th is already the 15th in Istanbul.
    expect(daysLeft(new Date("2026-10-14T22:30:00Z"), now, IST)).toBe(14);
  });

  it("says 'Süresiz' for no end, the date for a far one, and the days left within thirty", () => {
    expect(endLabel(null, now, opts)).toEqual({ kind: "never" });
    expect(endLabel("2026-12-31T20:59:59Z", now, opts)).toEqual({
      kind: "date",
      date: "31 Aralık 2026",
      warnDays: null,
    });
    expect(endLabel("2026-10-15T20:59:59Z", now, opts)).toEqual({
      kind: "date",
      date: "15 Ekim 2026",
      warnDays: 14,
    });
    expect(endLabel("2026-10-31T20:59:59Z", now, opts)).toMatchObject({
      warnDays: 30,
    });
    expect(endLabel("2026-11-01T20:59:59Z", now, opts)).toMatchObject({
      warnDays: null,
    });
  });

  it("never warns a negative number", () => {
    expect(endLabel("2026-09-30T10:00:00Z", now, opts)).toMatchObject({
      warnDays: 0,
    });
  });
});

describe("the calendar day of an instant", () => {
  it("is read in the viewer's zone", () => {
    expect(dayIn(new Date("2026-12-31T20:59:59Z"), IST)).toBe("2026-12-31");
    expect(dayIn(new Date("2026-12-31T21:00:00Z"), IST)).toBe("2027-01-01");
  });
});

describe("single permissions in the list", () => {
  it("print in the catalog's order, whatever order the API gave them", () => {
    const catalog = [{ id: "k", permissions: ["a", "b", "c"] }];
    expect(orderByCatalog(["c", "a", "x", "b"], catalog)).toEqual([
      "a",
      "b",
      "c",
      "x",
    ]);
    expect(orderByCatalog(["b", "a"], null)).toEqual(["b", "a"]);
  });
});

describe("the dialog's boxes (nizam 12 criteria 1, 2)", () => {
  const group = ["platform.kosk_create", "platform.kosk_edit"];

  it("drops from the extras what a group carries", () => {
    expect(
      withoutGroupCodes(["platform.kosk_edit", "platform.audit_read"], group)
    ).toEqual(["platform.audit_read"]);
    expect(withoutGroupCodes(["platform.audit_read"], [])).toEqual([
      "platform.audit_read",
    ]);
  });

  it("toggles one extra on and off without repeating it", () => {
    expect(toggleExtra([], "a", true)).toEqual(["a"]);
    expect(toggleExtra(["a"], "a", true)).toEqual(["a"]);
    expect(toggleExtra(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("counts 'Gruptan N izin ve M ek izin' from the group and the extras beyond it", () => {
    expect(summaryCounts(group, ["platform.kosk_edit", "x", "y", "z"])).toEqual(
      { fromGroup: 2, extra: 3 }
    );
    expect(summaryCounts([], ["x"])).toEqual({ fromGroup: 0, extra: 1 });
  });

  it("sends the extras in catalog order, without the group's", () => {
    const catalog = [
      { id: "kosks", permissions: ["a", "b", "c"] },
      { id: "audit", permissions: ["d"] },
    ];
    expect(extrasToSend(catalog, ["d", "c", "a"], ["a"])).toEqual(["c", "d"]);
  });

  it("selects the platform group a person holds, and none for a person with only course groups", () => {
    const base = {
      user: { id: "u", name: "A", email: null },
      groups: [],
      permissions: [],
    } as unknown as MedarisNazimResponse;
    expect(platformGroupOf(base)).toBeNull();
    const held = {
      ...base,
      groups: [
        { id: "c", name: "Ders", scope: "ALL_COURSES", courseTitle: null },
        { id: "p", name: "Köşk", scope: "PLATFORM", courseTitle: null },
      ],
    } as unknown as MedarisNazimResponse;
    expect(platformGroupOf(held)?.id).toBe("p");
  });
});

describe("the dismissal question (nizam 11, _kurallar 14, 15)", () => {
  const items = [
    { kind: "ROLE", id: "r1" },
    { kind: "GRANT", id: "g1" },
  ] as DecisionItem[];

  it("is ready only when every item has an answer", () => {
    const [role, grant] = items as [DecisionItem, DecisionItem];
    expect(dismissReady(items, {})).toBe(false);
    expect(dismissReady(items, { [givenKey(role)]: "DROP" })).toBe(false);
    const all = {
      [givenKey(role)]: "DROP" as const,
      [givenKey(grant)]: "TAKE_OVER" as const,
    };
    expect(dismissReady(items, all)).toBe(true);
    expect(dismissDecisions(items, all)).toEqual([
      { kind: "ROLE", id: "r1", action: "DROP" },
      { kind: "GRANT", id: "g1", action: "TAKE_OVER" },
    ]);
  });

  it("is ready at once when the person handed nothing on", () => {
    expect(dismissReady([], {})).toBe(true);
  });

  it("asks nothing about a group the person defined or changed: it is listed, not decided", () => {
    const given = [
      { kind: "ROLE", id: "r1" },
      { kind: "GROUP", id: "p1", groupName: "Kadro", groupAction: "update" },
      { kind: "GRANT", id: "g1" },
    ] as GivenItemResponse[];
    expect(decisionItems(given).map(givenKey)).toEqual(["ROLE:r1", "GRANT:g1"]);
    expect(groupItems(given).map((g) => g.groupName)).toEqual(["Kadro"]);
    const all = { "ROLE:r1": "DROP", "GRANT:g1": "DROP" } as const;
    expect(dismissReady(decisionItems(given), all)).toBe(true);
    expect(
      dismissDecisions(decisionItems(given), all).map((d) => d.kind)
    ).toEqual(["ROLE", "GRANT"]);
  });

  it("asks nothing about a row the person made for themselves: the API revokes it and takes no answer for it", () => {
    const person = "AAAAAAAA-0000-4000-8000-000000000001";
    const given = [
      { kind: "ROLE", id: "r1", to: { id: "u-rabia" } },
      { kind: "ROLE", id: "r2", to: { id: person.toLowerCase() } },
      { kind: "GRANT", id: "g1", to: { id: person.toLowerCase() } },
      { kind: "GROUP", id: "p1", to: null },
    ] as GivenItemResponse[];
    expect(decisionItems(given, person).map(givenKey)).toEqual(["ROLE:r1"]);
    expect(selfMadeItems(given, person).map(givenKey)).toEqual([
      "ROLE:r2",
      "GRANT:g1",
    ]);
    const answers = { "ROLE:r1": "TAKE_OVER" } as const;
    expect(dismissReady(decisionItems(given, person), answers)).toBe(true);
    expect(dismissDecisions(decisionItems(given, person), answers)).toEqual([
      { kind: "ROLE", id: "r1", action: "TAKE_OVER" },
    ]);
    // Without the person, nothing is set apart (the older call still works).
    expect(decisionItems(given).map(givenKey)).toEqual([
      "ROLE:r1",
      "ROLE:r2",
      "GRANT:g1",
    ]);
    expect(selfMadeItems(given, undefined)).toEqual([]);
  });
});

describe("the group form (nizam 13 criteria 2, 3, 4)", () => {
  const catalog: PermissionCatalogResponse = {
    platform: [{ id: "kosks", permissions: ["platform.kosk_create"] }],
    course: ["course.edit", "course.publish"],
  };
  const groups = [
    { id: "1", name: "Köşk işleri" },
    { id: "2", name: "Denetim" },
  ];

  it("filters the catalog by scope and drops what the new scope cannot hold", () => {
    expect(catalogFor("PLATFORM", catalog)).toEqual(catalog.platform);
    expect(catalogFor("ALL_COURSES", catalog)).toEqual([
      { id: "course", permissions: ["course.edit", "course.publish"] },
    ]);
    expect(
      keepAllowed(
        ["platform.kosk_create", "course.edit"],
        "ALL_COURSES",
        catalog
      )
    ).toEqual(["course.edit"]);
    expect(
      keepAllowed(["platform.kosk_create", "course.edit"], "PLATFORM", catalog)
    ).toEqual(["platform.kosk_create"]);
  });

  it("refuses a blank, an over-long and a repeated name (case aside), but not the group's own", () => {
    expect(groupNameError("  ", groups, null)).toBe("nameRequired");
    expect(groupNameError("x".repeat(81), groups, null)).toBe("nameTooLong");
    expect(groupNameError("denetim", groups, null)).toBe("nameTaken");
    expect(groupNameError("KÖŞK İŞLERİ", groups, null)).toBe("nameTaken");
    expect(groupNameError("Denetim", groups, "2")).toBeNull();
    expect(groupNameError("Yayın ve bağlantılar", groups, null)).toBeNull();
  });

  it("asks what becomes of the users only while there are some, and for a save only when permissions change", () => {
    expect(needsUsersQuestion(0, "delete")).toBe(false);
    expect(needsUsersQuestion(2, "delete")).toBe(true);
    expect(needsUsersQuestion(0, { before: ["a"], after: [] })).toBe(false);
    expect(
      needsUsersQuestion(1, { before: ["a", "b"], after: ["b", "a"] })
    ).toBe(false);
    expect(needsUsersQuestion(1, { before: ["a"], after: ["a", "b"] })).toBe(
      true
    );
  });

  it("maps the API's codes to a message and falls back to the generic one", () => {
    expect(permissionErrorKey({ code: "PERMISSION_GROUP_NAME_TAKEN" })).toBe(
      "errors.nameTaken"
    );
    expect(permissionErrorKey({ code: "GRANT_EXPIRY_INVALID" })).toBe(
      "errors.expiryInvalid"
    );
    expect(permissionErrorKey({ code: "WHATEVER" })).toBe("errors.generic");
    expect(permissionErrorKey(undefined)).toBe("errors.generic");
    expect(permissionErrorKey({ code: "DISMISS_SEAT_HANDED_ON" })).toBe(
      "errors.dismissCascade"
    );
    expect(permissionErrorKey({ code: "DISMISS_TAKE_OVER_WITHOUT_SEAT" })).toBe(
      "errors.dismissSeatless"
    );
  });
});

const render = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone={IST}
      messages={{ nizam: resources.tr.nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

const person = (id: string, name: string, email: string) => ({
  id,
  name,
  email,
});

const nazim = (
  over: Partial<MedarisNazimResponse> & { user: MedarisNazimResponse["user"] }
): MedarisNazimResponse => ({
  appointedBy: person("a", "Yusuf Ziya Ertuğrul", "y@example.com"),
  appointedAt: new Date("2026-09-14T09:00:00Z"),
  assignmentExpiresAt: null,
  expiresAt: null,
  groups: [],
  permissions: [],
  ...over,
});

const three: MedarisNazimResponse[] = [
  nazim({
    user: person("u1", "Hasan Basri Gündoğdu", "h.gundogdu@example.com"),
    expiresAt: new Date("2026-12-31T20:59:59Z"),
    groups: [
      {
        id: "g1",
        name: "Köşk işleri",
        scope: "PLATFORM",
        courseTitle: null,
        permissions: ["platform.kosk_create"],
      },
      {
        id: "g2",
        name: "Ders denetimi",
        scope: "ALL_COURSES",
        courseTitle: null,
        permissions: ["course.edit"],
      },
    ],
    permissions: [
      { code: "platform.madrasah_create", grantedAt: new Date() },
      { code: "platform.deck_publish", grantedAt: new Date() },
      { code: "platform.ban_account", grantedAt: new Date() },
    ],
  }),
  nazim({
    user: person(
      "u2",
      "Rabia Hümeyra Tokatlıoğlu",
      "r.tokatlioglu@example.com"
    ),
    appointedAt: new Date("2026-09-15T09:00:00Z"),
    expiresAt: new Date("2026-10-15T20:59:59Z"),
    groups: [
      {
        id: "g3",
        name: "Denetim",
        scope: "PLATFORM",
        courseTitle: null,
        permissions: ["platform.audit_read"],
      },
    ],
  }),
  nazim({
    user: person("u3", "Seyyid Ahmet Kocabeyoğlu", "s.kocabeyoglu@example.com"),
    permissions: [
      { code: "platform.inactive_scopes_manage", grantedAt: new Date() },
      { code: "platform.youtube_manage", grantedAt: new Date() },
    ],
  }),
];

const catalog: PermissionCatalogResponse = {
  platform: [
    {
      id: "kosks",
      permissions: ["platform.kosk_create", "platform.kosk_edit"],
    },
    { id: "audit", permissions: ["platform.audit_read"] },
  ],
  course: ["course.edit"],
};

const groupRows: PermissionGroupResponse[] = [
  {
    id: "g1",
    name: "Köşk işleri",
    scope: "PLATFORM",
    courseId: null,
    courseTitle: null,
    permissions: ["platform.kosk_create", "platform.kosk_edit"],
    userCount: 1,
  },
  {
    id: "g2",
    name: "Ders denetimi",
    scope: "ALL_COURSES",
    courseId: null,
    courseTitle: null,
    permissions: ["course.edit"],
    userCount: 2,
  },
];

describe("NazimsView (nizam 11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const view = (list: MedarisNazimResponse[] | null = three) =>
    render(
      <NazimsView
        nazims={list}
        catalog={list === null ? null : catalog}
        groups={list === null ? null : groupRows}
      />
    );

  it("draws the title, 'Medaris nazımı ata', the count and a row per person in the API's order (criterion 1)", () => {
    const html = view();
    expect(html).toContain("Medaris nazımları");
    expect(html).toContain("Medaris nazımı ata");
    expect(html).toContain("3 kişi");
    const order = [
      "Hasan Basri Gündoğdu",
      "Rabia Hümeyra Tokatlıoğlu",
      "Seyyid Ahmet Kocabeyoğlu",
    ].map((n) => html.indexOf(n));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("h.gundogdu@example.com");
  });

  it("prints a group as a chip with its hidden 'grubu', 'her ders' beside a course-wide one, and the single permissions after 've'", () => {
    const html = view();
    expect(html).toContain("Köşk işleri");
    expect(html).toContain("grubu");
    expect(html).toContain("her ders");
    expect(html).toContain(
      "ve Medrese aç, Desteyi herkese yayımla, Platformdan yasakla"
    );
    expect(html).toContain(
      "Pasif kapsamları yönet, YouTube bağlantısını yönet"
    );
  });

  it("writes 'Süresiz' for no end, the date, and the days left within thirty (criterion 2)", () => {
    const html = view();
    expect(html).toContain("Süresiz");
    expect(html).toContain("31 Aralık 2026");
    expect(html).toContain("15 Ekim 2026");
    expect(html).toContain("14 gün kaldı");
    expect(html.match(/days-left/g)).toHaveLength(1);
  });

  it("names who gave the permissions and when, and offers both buttons per row", () => {
    const html = view();
    expect(html).toContain("Yusuf Ziya Ertuğrul");
    expect(html).toContain("14 Eylül 2026");
    expect(html).toContain("İzinleri düzenle: Hasan Basri Gündoğdu");
    expect(html).toContain("Görevden al: Seyyid Ahmet Kocabeyoğlu");
  });

  it("keeps 'Görevden al' off until the gate has opened", () => {
    // Before mounting the gate is shut, so the markup a server sends has it disabled.
    const html = view();
    const button = html.match(
      /<button[^>]*aria-label="Görevden al: Hasan Basri Gündoğdu"[^>]*>/
    )?.[0];
    expect(button).toBeDefined();
    expect(button).toMatch(/disabled/);
    const edit = html.match(
      /<button[^>]*aria-label="İzinleri düzenle: Hasan Basri Gündoğdu"[^>]*>/
    )?.[0];
    expect(edit).not.toMatch(/disabled/);
  });

  it("says what is empty, and shows the error state with 'Yeniden dene' when the read failed", () => {
    expect(view([])).toContain("Henüz görevde Medaris nazımı yok.");
    const failed = view(null);
    expect(failed).toContain("Medaris nazımları yüklenemedi");
    expect(failed).toContain("Yeniden dene");
    expect(failed).not.toContain("<table");
  });

  it("says 'İzin verilmemiş' for a person with neither a group nor a permission", () => {
    const html = view([
      nazim({ user: person("u9", "Yeni Kişi", "yeni@example.com") }),
    ]);
    expect(html).toContain("İzin verilmemiş");
  });
});

describe("GroupsView (nizam 13)", () => {
  const users: GroupUserResponse[] = [
    {
      userId: "u1",
      name: "Hasan Basri Gündoğdu",
      email: "h.gundogdu@example.com",
      isMedarisNazim: true,
      expiresAt: new Date("2026-12-31T20:59:59Z"),
    },
  ];
  const view = (
    selected: string,
    rows: PermissionGroupResponse[] | null = groupRows
  ) =>
    render(
      <GroupsView
        groups={rows}
        catalog={rows === null ? null : catalog}
        nazims={rows === null ? null : three}
        selected={selected}
        users={users}
      />
    );

  it("lists the groups with scope, permission count and who uses them (criterion 1)", () => {
    const html = view("g1");
    expect(html).toContain("İzin grupları");
    expect(html).toContain("Grup oluştur");
    expect(html).toContain("Platform · 2 izin");
    expect(html).toContain("Her ders · 1 izin");
    expect(html).toContain("1 kişi kullanıyor");
    expect(html).toContain("2 kişi kullanıyor");
    expect(html).toContain('aria-current="page"');
  });

  it("shows the selected group's form with its users and the note about what becomes of them", () => {
    const html = view("g1");
    expect(html).toContain('value="Köşk işleri"');
    expect(html).toContain("Grup adı");
    expect(html).toContain("İzin verirken bu adı görürsünüz.");
    expect(html).toContain("Kapsam, gruba girebilecek izinleri belirler.");
    expect(html).toContain("Kullananlar");
    expect(html).toContain("Medaris nazımı · bitiş 31 Aralık 2026");
    expect(html).toContain("İzinlerini düzenle: Hasan Basri Gündoğdu");
    expect(html).toContain(
      "Kaydederken ya da silerken grubu kullananların izinlerine ne olacağını seçersiniz."
    );
    expect(html).toContain("Grubu sil");
  });

  it("filters the permission boxes by the group's scope (criterion 2)", () => {
    const platform = view("g1");
    expect(platform).toContain("Köşk aç ve köşk nazımını seç");
    expect(platform).not.toContain("Dersi düzenle: başlık");
    const course = view("g2");
    expect(course).toContain("Dersi düzenle: başlık");
    expect(course).not.toContain("Köşk aç ve köşk nazımını seç");
  });

  it("opens an empty form for a new group, with no users and no delete button", () => {
    const html = view("new");
    expect(html).toContain("Yeni grup");
    expect(html).not.toContain("Kullananlar");
    expect(html).not.toContain("Grubu sil:");
  });

  it("offers 'Bir ders' as a choice nobody can make yet", () => {
    const html = view("new");
    const radio = html.match(
      /<[a-z]+[^>]*role="radio"[^>]*aria-labelledby="[^"]*-2-l"[^>]*>/
    )?.[0];
    expect(radio).toBeDefined();
    expect(radio).toMatch(/data-disabled|aria-disabled/);
  });

  it("shows the error state with 'Yeniden dene' when the read failed", () => {
    const html = view("new", null);
    expect(html).toContain("İzin grupları yüklenemedi");
    expect(html).toContain("Yeniden dene");
  });

  it("says when the selected group is gone", () => {
    expect(view("zzz")).toContain("Bu grup yok");
  });

  it("formats a day the way the screens do", () => {
    expect(formatDay("2026-12-31T20:59:59Z", "tr", IST)).toBe("31 Aralık 2026");
  });
});
