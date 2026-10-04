import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import { permissionLabel } from "~/features/nazirs/nazirs";
import {
  type Catalog,
  draftOfGroup,
  type EditorDraft,
  editorProblems,
  editorRequest,
  editorSummary,
  emptyGroup,
  expiryOf,
  type GroupView,
  groupBody,
  groupPatch,
  groupProblems,
  groupSummary,
  groupValid,
  initialDraft,
  isLocked,
  isTicked,
  limitedCourses,
  nameProblem,
  needsUsersAnswer,
  notLimitable,
  permissionCounts,
  pickGroup,
  scopeAllows,
  tick,
  toggleCode,
  toggleCourse,
  userCountOf,
  withScope,
} from "~/features/nazirs/permissions";
import { translatorFor } from "./server-render";

const t = translatorFor("nazir");
const IST = "Europe/Istanbul";

/** The two sections of the dictionary as the API sends them (MDRS-185), in print order. */
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
const catalog: Catalog = {
  madrasah: MADRASAH,
  course: COURSE,
  givable: [...MADRASAH, ...COURSE],
};

const group = (over: Partial<GroupView> = {}): GroupView => ({
  id: "g-1",
  name: "Kayıt ve talebe işleri",
  scope: "COURSE",
  permissions: ["enrollment.decide", "enrollment.remove"],
  userCount: 0,
  ...over,
});
const medreseGroup = group({
  id: "g-2",
  name: "Ders açma ve kadro",
  scope: "MADRASAH",
  permissions: ["madrasah.course_open", "course.edit"],
});

const draft = (over: Partial<EditorDraft> = {}): EditorDraft => ({
  groupId: null,
  extras: [],
  everyCourse: true,
  courseIds: [],
  expiresAtLocal: "",
  ...over,
});

describe("the permission sentences", () => {
  const tr = resources.tr.nazir.Account.permissions as Record<string, string>;
  const key = (code: string) => code.replaceAll(".", "_");

  it("pins the ten medrese sentences, word for word (nazir 06 and 16)", () => {
    expect(MADRASAH.map((code) => tr[key(code)])).toEqual([
      "Medrese dersi aç",
      "Müderris ekle ya da çıkar; imamı değiştir",
      "Medresenin talebelerini gör",
      "Medrese düzeyinde yasakla; ders yasağını medreseye genişlet",
      "Medrese derslerini gizle, geri al",
      "Kabul kurallarını belirle",
      "Köşk kararına itiraz aç",
      "Kalıcı yasak talebi aç",
      "Medrese ayarlarını ve politikalarını değiştir",
      "Medrese nazırı ata",
    ]);
  });

  for (const locale of ["tr", "en", "ar"] as const) {
    it(`${locale} has a sentence for each of the thirty codes the dialogs list`, () => {
      const sentences = resources[locale].nazir.Account.permissions as Record<
        string,
        string
      >;
      for (const code of [...MADRASAH, ...COURSE]) {
        expect(sentences[key(code)], `${locale} ${code}`).toEqual(
          expect.any(String)
        );
      }
    });
  }

  it("words a code through the account page's sentence", () => {
    expect(permissionLabel("madrasah.nazir_appoint", t)).toBe(
      "Medrese nazırı ata"
    );
    expect(permissionLabel("user.lookup", t)).toBe("E-postayla kullanıcı bul");
  });
});

describe("a group's permissions in the editor (criterion 1)", () => {
  it("come ticked and locked, and a single permission is ticked beside them", () => {
    const d = draft({ groupId: "g-1", extras: ["week.hide"] });
    expect(isLocked("enrollment.decide", group())).toBe(true);
    expect(isTicked("enrollment.decide", d, group())).toBe(true);
    expect(isLocked("week.hide", group())).toBe(false);
    expect(isTicked("week.hide", d, group())).toBe(true);
    expect(isTicked("course.edit", d, group())).toBe(false);
    expect(isLocked("enrollment.decide", null)).toBe(false);
  });

  it("ticks and unticks single permissions one at a time", () => {
    const on = tick(draft(), "week.hide", true);
    expect(on.extras).toEqual(["week.hide"]);
    expect(tick(on, "week.hide", true).extras).toEqual(["week.hide"]);
    expect(tick(on, "week.hide", false).extras).toEqual([]);
  });

  it("opens with the single permissions the group does not carry, a missing group as none, and the end as a date and time", () => {
    const opened = initialDraft(
      {
        groupId: "g-1",
        permissions: ["enrollment.decide", "week.hide"],
        courseIds: null,
        expiresAt: "2026-12-31T20:59:00.000Z",
      },
      [group()],
      IST
    );
    expect(opened).toEqual(
      draft({
        groupId: "g-1",
        extras: ["week.hide"],
        expiresAtLocal: "2026-12-31T23:59",
      })
    );
    const gone = initialDraft(
      { groupId: "g-9", permissions: [], courseIds: ["c-1"], expiresAt: null },
      [group()],
      IST
    );
    expect(gone).toEqual(
      draft({ everyCourse: false, courseIds: ["c-1"], expiresAtLocal: "" })
    );
  });

  it("counts the group's permissions and the single ones beyond them: 'Gruptan 4 izin ve 1 ek izin'", () => {
    const four = group({
      permissions: [
        "madrasah.students_view",
        "enrollment.decide",
        "enrollment.remove",
        "session.view_content",
      ],
    });
    const counts = permissionCounts(
      draft({ groupId: "g-1", extras: ["week.hide", "enrollment.decide"] }),
      four,
      catalog
    );
    expect(counts).toEqual({ group: 4, extra: 1 });
    expect(editorSummary(counts, t)).toBe("Gruptan 4 izin ve 1 ek izin");
    expect(editorSummary({ group: 4, extra: 0 }, t)).toBe("Gruptan 4 izin");
    expect(editorSummary({ group: 0, extra: 3 }, t)).toBe("3 izin");
    expect(editorSummary({ group: 0, extra: 0 }, t)).toBe("Hiç izin seçilmedi");
  });
});

describe("'Hangi derslerde'", () => {
  it("cannot name courses for a group with a medrese permission, which covers every course", () => {
    expect(notLimitable(draft(), medreseGroup, catalog)).toBe(
      "group-spans-medrese"
    );
    expect(
      pickGroup(
        draft({ everyCourse: false, courseIds: ["c-1"] }),
        medreseGroup,
        catalog
      ).everyCourse
    ).toBe(true);
    expect(
      pickGroup(
        draft({ everyCourse: false, courseIds: ["c-1"] }),
        group(),
        catalog
      ).everyCourse
    ).toBe(false);
  });

  it("cannot name courses when no course permission is given, since there is nothing to limit", () => {
    expect(notLimitable(draft(), null, catalog)).toBe("no-course-permission");
    expect(
      notLimitable(draft({ extras: ["madrasah.ban"] }), null, catalog)
    ).toBe("no-course-permission");
    expect(
      notLimitable(draft({ extras: ["week.hide"] }), null, catalog)
    ).toBeNull();
    expect(notLimitable(draft(), group(), catalog)).toBeNull();
  });

  it("limits to the chosen courses only where it can, else every course", () => {
    const chosen = draft({
      everyCourse: false,
      courseIds: ["c-1", "c-2"],
      extras: ["week.hide"],
    });
    expect(limitedCourses(chosen, null, catalog)).toEqual(["c-1", "c-2"]);
    expect(
      limitedCourses(draft({ ...chosen, everyCourse: true }), null, catalog)
    ).toBeNull();
    expect(limitedCourses(chosen, medreseGroup, catalog)).toBeNull();
    expect(limitedCourses({ ...chosen, extras: [] }, null, catalog)).toBeNull();
    expect(toggleCourse(draft(), "c-1", true).courseIds).toEqual(["c-1"]);
    expect(
      toggleCourse(draft({ courseIds: ["c-1"] }), "c-1", false).courseIds
    ).toEqual([]);
  });
});

describe("'Bitiş tarihi ve saati' (criterion 3, MDRS-254)", () => {
  const now = Date.parse("2026-10-05T10:00:00+03:00");
  const ctx = { now, timeZone: IST, assignmentEnd: null };
  const none = { expiresAt: null };

  it("is no end when left empty", () => {
    expect(expiryOf(draft(), none, ctx)).toEqual({ at: null, problem: null });
  });

  it("is the moment typed, read on the viewer's clock", () => {
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-12-31T23:59" }), none, ctx)
    ).toEqual({ at: "2026-12-31T20:59:00.000Z", problem: null });
    // later today is not the past
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-10-05T18:00" }), none, ctx)
    ).toEqual({ at: "2026-10-05T15:00:00.000Z", problem: null });
  });

  it("cannot be in the past or now, as the server counts", () => {
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-10-05T09:59" }), none, ctx)
    ).toEqual({ at: null, problem: "past" });
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-10-05T10:00" }), none, ctx).problem
    ).toBe("past");
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-10-05T10:01" }), none, ctx).problem
    ).toBeNull();
    expect(
      expiryOf(draft({ expiresAtLocal: "nonsense" }), none, ctx).problem
    ).toBe("past");
  });

  it("is refused while the field is half typed, as the browser reports it", () => {
    expect(expiryOf(draft({ expiresUnfinished: true }), none, ctx)).toEqual({
      at: null,
      problem: "unfinished",
    });
    expect(
      editorProblems(
        draft({ expiresUnfinished: true }),
        null,
        catalog,
        none,
        ctx
      ).expires
    ).toBe("unfinished");
    expect(
      expiryOf(
        draft({ expiresAtLocal: "2026-12-31T23:59", expiresUnfinished: true }),
        none,
        ctx
      )
    ).toEqual({ at: "2026-12-31T20:59:00.000Z", problem: null });
  });

  it("cannot be after the appointment ends, to the minute", () => {
    const withEnd = { ...ctx, assignmentEnd: "2026-12-15T09:00:59.000Z" };
    // 12:00 in Istanbul is 09:00:00Z, the minute the appointment ends in
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-12-15T12:00" }), none, withEnd)
    ).toEqual({ at: "2026-12-15T09:00:00.000Z", problem: null });
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-12-15T12:01" }), none, withEnd)
    ).toEqual({ at: null, problem: "afterAppointment" });
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-11-01T12:00" }), none, withEnd)
        .problem
    ).toBeNull();
  });

  it("keeps the instant the API holds for an end left as it was", () => {
    const held = { expiresAt: "2026-10-06T08:00:30.000Z" };
    expect(
      expiryOf(draft({ expiresAtLocal: "2026-10-06T11:00" }), held, ctx)
    ).toEqual({ at: "2026-10-06T08:00:30.000Z", problem: null });
  });

  it.each([
    ["UTC+1", "Europe/Berlin"],
    ["UTC+2", "Europe/Athens"],
    ["UTC+3", "Europe/Istanbul"],
    ["UTC-8", "America/Los_Angeles"],
  ])("saves an untouched end that ends the appointment's own Turkish day in %s", (_name, zone) => {
    // The end MDRS-254 was found with: the last second of a Turkish day.
    const end = "2026-12-31T20:59:59.000Z";
    const there = { now, timeZone: zone, assignmentEnd: end };
    const opened = initialDraft(
      {
        groupId: null,
        permissions: [],
        courseIds: null,
        expiresAt: end,
      },
      [],
      zone
    );
    expect(expiryOf(opened, { expiresAt: end }, there)).toEqual({
      at: end,
      problem: null,
    });
  });
});

describe("what 'Kaydet' sends", () => {
  const ctx = {
    now: Date.parse("2026-10-05T10:00:00+03:00"),
    timeZone: IST,
    assignmentEnd: null,
  };
  const none = { expiresAt: null };

  it("is the group, the single permissions beyond it in the dictionary's order, the courses and the end", () => {
    const d = draft({
      groupId: "g-1",
      // week.hide before madrasah.ban on purpose; enrollment.decide is the group's
      extras: ["week.hide", "enrollment.decide", "madrasah.ban", "nonsense"],
      everyCourse: false,
      courseIds: ["c-2"],
      expiresAtLocal: "2026-12-31T23:59",
    });
    expect(editorRequest(d, group(), catalog, none, ctx)).toEqual({
      groupId: "g-1",
      permissions: ["madrasah.ban", "week.hide"],
      courseIds: ["c-2"],
      expiresAt: "2026-12-31T20:59:00.000Z",
    });
  });

  it("is every course and no end by default, and nothing at all when nothing is ticked", () => {
    expect(editorRequest(draft(), null, catalog, none, ctx)).toEqual({
      groupId: null,
      permissions: [],
      courseIds: null,
      expiresAt: null,
    });
  });

  it("finds no problem in a plain draft, a missing course or a bad end", () => {
    expect(editorProblems(draft(), null, catalog, none, ctx)).toEqual({
      courses: false,
      expires: null,
    });
    const noCourse = draft({
      everyCourse: false,
      courseIds: [],
      extras: ["week.hide"],
    });
    expect(editorProblems(noCourse, null, catalog, none, ctx).courses).toBe(
      true
    );
    // with no course permission the choice is moot, so it is not a problem
    expect(
      editorProblems({ ...noCourse, extras: [] }, null, catalog, none, ctx)
        .courses
    ).toBe(false);
    expect(
      editorProblems(
        draft({ expiresAtLocal: "2026-01-01T09:00" }),
        null,
        catalog,
        none,
        ctx
      ).expires
    ).toBe("past");
  });
});

describe("a group's scope (nazir 16)", () => {
  it("lets every permission into 'Medrese' and only the course ones into 'Ders' (criterion 3)", () => {
    expect(scopeAllows("MADRASAH", catalog, "madrasah.ban")).toBe(true);
    expect(scopeAllows("MADRASAH", catalog, "week.hide")).toBe(true);
    expect(scopeAllows("COURSE", catalog, "madrasah.ban")).toBe(false);
    expect(scopeAllows("COURSE", catalog, "week.hide")).toBe(true);
  });

  it("unticks what the new scope does not allow when the scope changes, and keeps the rest", () => {
    const d = {
      ...emptyGroup(),
      permissions: ["madrasah.ban", "week.hide", "madrasah.course_open"],
    };
    expect(withScope(d, "COURSE", catalog)).toMatchObject({
      scope: "COURSE",
      permissions: ["week.hide"],
    });
    expect(withScope(d, "MADRASAH", catalog).permissions).toEqual(
      d.permissions
    );
  });

  it("counts the permissions that are ticked ('N izin')", () => {
    let d = emptyGroup();
    d = toggleCode(d, "week.hide", true);
    d = toggleCode(d, "course.edit", true);
    d = toggleCode(d, "week.hide", true);
    expect(d.permissions).toHaveLength(2);
    expect(toggleCode(d, "week.hide", false).permissions).toEqual([
      "course.edit",
    ]);
  });
});

describe("saving a group (criterion 1)", () => {
  it("needs a name and at least one permission", () => {
    expect(groupProblems(emptyGroup())).toEqual({
      name: "required",
      permissions: true,
    });
    expect(nameProblem("   ")).toBe("required");
    expect(nameProblem("a".repeat(81))).toBe("long");
    expect(nameProblem(` ${"a".repeat(80)} `)).toBeNull();
    expect(groupValid({ ...emptyGroup(), name: "Ders" })).toBe(false);
    expect(
      groupValid({ ...emptyGroup(), name: "Ders", permissions: ["week.hide"] })
    ).toBe(true);
  });

  it("sends the trimmed name, the scope and the permissions in the dictionary's order", () => {
    expect(
      groupBody(
        {
          name: "  Ders açma ve kadro ",
          scope: "MADRASAH",
          permissions: ["week.hide", "madrasah.course_open", "nonsense"],
        },
        catalog
      )
    ).toEqual({
      name: "Ders açma ve kadro",
      scope: "MADRASAH",
      permissions: ["madrasah.course_open", "week.hide"],
    });
  });

  it("patches only what changed, and nothing when nothing did", () => {
    const g = group({
      name: "Kayıt",
      permissions: ["week.hide", "course.edit"],
    });
    const same = draftOfGroup(g);
    expect(groupPatch(g, same, catalog)).toBeNull();
    // the same permissions in another order are not a change
    expect(
      groupPatch(
        g,
        { ...same, permissions: ["course.edit", "week.hide"] },
        catalog
      )
    ).toBeNull();
    expect(groupPatch(g, { ...same, name: " Yeni ad " }, catalog)).toEqual({
      name: "Yeni ad",
    });
    expect(
      groupPatch(g, { ...same, permissions: ["week.hide"] }, catalog)
    ).toEqual({ permissions: ["week.hide"] });
  });
});

describe("a group that people use (criterion 4)", () => {
  const used = { userCount: 2 };

  it("asks before its permissions change, never for a rename", () => {
    expect(needsUsersAnswer(used, { permissions: ["week.hide"] })).toBe(true);
    expect(needsUsersAnswer(used, { name: "Yeni ad" })).toBe(false);
    expect(
      needsUsersAnswer({ userCount: 0 }, { permissions: ["week.hide"] })
    ).toBe(false);
  });

  it("reads how many people hold it from the API's refusal", () => {
    expect(userCountOf({ code: "X", context: { userCount: 3 } })).toBe(3);
    expect(userCountOf({ code: "X", details: { userCount: 4 } })).toBe(4);
    expect(userCountOf({ code: "X" })).toBeUndefined();
    expect(userCountOf(null)).toBeUndefined();
    expect(userCountOf({ context: { userCount: "3" } })).toBeUndefined();
  });
});

describe("a group's card", () => {
  it("sums the permissions up: the first four as sentences, then how many more", () => {
    expect(
      groupSummary(["madrasah.course_open", "madrasah.muderris_manage"], t)
    ).toBe("Medrese dersi aç · Müderris ekle ya da çıkar; imamı değiştir");
    const six = groupSummary(
      [
        "course.edit",
        "session.manage",
        "week.hide",
        "ban.course",
        "user.lookup",
        "recording.upload",
      ],
      t
    );
    expect(six.split(" · ")).toHaveLength(5);
    expect(six.endsWith("ve 2 izin daha")).toBe(true);
  });
});
