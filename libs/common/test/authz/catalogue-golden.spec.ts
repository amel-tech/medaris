import {
  ASSIGNED_ROLES,
  PERMISSION_META,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from "../../src";

/**
 * The catalogue frozen by hand (review T3, T8). The role-default tests derive
 * what a role holds from the scope tags, so a code tagged for the wrong scope
 * moves into the wrong defaults and every one of those tests still agrees with
 * itself. This table does not derive anything: change a tag, a flag or add a
 * code and this fails until a person has read the row and edited it here.
 *
 * Row: code, the scope types it is held in (`-` for none), flags.
 */
const GOLDEN: ReadonlyArray<readonly [string, string, string]> = [
  ["kosk.manage", "kosk", "grantable"],
  ["kosk.hosting", "kosk", "grantable"],
  ["course.open_standalone", "kosk", "grantable|notInMadrasahCourse"],
  ["course.manage_all", "kosk", "grantable"],
  ["ban.manage_kosk", "kosk", "grantable"],
  ["deck.manage_kosk", "kosk", "grantable"],
  ["course_nazir.assign_kosk", "kosk", "grantable"],
  ["user.lookup", "kosk+course", "grantable"],
  ["course.hide", "kosk", "unlisted"],
  ["course.edit", "course", "grantable|content"],
  ["session.manage", "course", "grantable|content"],
  ["session.live_link", "course", "grantable|content"],
  ["week.hide", "course", "grantable|content"],
  ["course.settings", "course", "grantable"],
  ["course.publish", "course", "grantable"],
  ["course.view_unpublished", "course", "grantable|content"],
  ["enrollment.decide", "course", "grantable|content"],
  ["enrollment.remove", "course", "grantable|content"],
  ["enrollment.complete", "course", "grantable|content"],
  ["recording.manage", "course", "grantable|content"],
  ["recording.upload", "course", "grantable|content"],
  ["recording.watch_restricted", "course", "grantable|content"],
  ["session.view_content", "course", "grantable|content"],
  ["ban.course", "course", "grantable"],
  ["ban.lift_course", "course", "grantable"],
  ["deck.manage_course", "course", "grantable"],
  ["deck.propose_kosk", "course", "grantable"],
  ["course_nazir.assign", "course", "grantable"],
  ["permission_group.define", "course", "grantable"],
  ["permission.grant", "kosk+madrasah+course", "unlisted"],
  ["platform.kosk_create", "platform", "grantable"],
  ["platform.kosk_nazim_manage", "platform", "grantable"],
  ["platform.kosk_edit", "platform", "grantable"],
  ["platform.hosting_grant", "platform", "grantable"],
  ["platform.madrasah_create", "platform", "grantable"],
  ["platform.head_muderris_manage", "platform", "grantable"],
  ["platform.madrasah_edit", "platform", "grantable"],
  ["platform.madrasah_nazir_grant", "platform", "grantable"],
  ["platform.kosk_application_decide", "platform", "grantable"],
  ["platform.deck_publish", "platform", "grantable"],
  ["platform.appeal_decide", "platform", "grantable"],
  ["platform.ban_scoped", "platform", "grantable"],
  ["platform.ban_account", "platform", "grantable"],
  ["platform.audit_read", "platform", "grantable"],
  ["platform.inactive_scopes_manage", "platform", "grantable"],
  ["platform.youtube_manage", "platform", "grantable"],
  ["platform.policy_edit", "platform", "grantable"],
  ["madrasah.course_open", "madrasah", "grantable"],
  ["madrasah.muderris_manage", "madrasah", "grantable"],
  ["madrasah.students_view", "madrasah", "grantable"],
  ["madrasah.ban", "madrasah", "grantable"],
  ["madrasah.course_hide", "madrasah", "grantable"],
  ["madrasah.hide", "madrasah", "unlisted"],
  ["madrasah.admission_rules", "madrasah", "grantable"],
  ["madrasah.appeal_open", "madrasah", "grantable"],
  ["madrasah.permanent_ban_request", "madrasah", "grantable"],
  ["madrasah.settings_edit", "madrasah", "grantable"],
  ["madrasah.nazir_appoint", "madrasah", "grantable"],
  ["madrasah.offsite_course_request", "madrasah", "grantable"],
  ["course.view", "-", "implicit"],
  ["course.view_details", "-", "content|implicit"],
  ["course.enroll", "-", "implicit"],
  ["course.staff_read", "-", "content|implicit"],
  ["kosk.view", "-", "implicit"],
  ["madrasah.view", "-", "implicit"],
  ["deck.view", "-", "implicit"],
  ["deck.create_card", "-", "implicit"],
  ["deck.manage_cards", "-", "implicit"],
  ["deck.create_private", "-", "implicit"],
  ["deck.manage_private", "-", "implicit"],
  ["course.delete", "-", "implicit"],
  ["kosk.delete", "-", "implicit"],
  ["madrasah.delete", "-", "implicit"],
  ["setting.approval_off", "-", "implicit|from:course.settings"],
  ["setting.recordings_public", "-", "implicit|from:course.settings"],
  ["setting.course_open", "-", "implicit|from:course.settings"],
];

const rowOf = (code: string) => {
  const meta = PERMISSION_META[code as keyof typeof PERMISSION_META];
  return [
    code,
    meta.scopes.join("+") || "-",
    [
      meta.grantable ? "grantable" : "",
      meta.content ? "content" : "",
      meta.unlisted ? "unlisted" : "",
      meta.implicit ? "implicit" : "",
      meta.notInMadrasahCourse ? "notInMadrasahCourse" : "",
      meta.derivedFrom ? `from:${meta.derivedFrom}` : "",
    ]
      .filter(Boolean)
      .join("|") || "-",
  ];
};

describe("the catalogue, frozen by hand (review T3)", () => {
  it("is exactly this table: every code, its scope types and its flags", () => {
    expect(Object.values(PERMISSIONS).map(rowOf)).toEqual(
      GOLDEN.map((row) => [...row])
    );
  });

  it("tags the three codes a mutation once moved to the wrong scope where they belong", () => {
    expect(PERMISSION_META[PERMISSIONS.BAN_COURSE].scopes).toEqual(["course"]);
    expect(PERMISSION_META[PERMISSIONS.MADRASAH_BAN].scopes).toEqual([
      "madrasah",
    ]);
    expect(PERMISSION_META[PERMISSIONS.KOSK_HOSTING].scopes).toEqual(["kosk"]);
  });

  it("marks reading what is restricted as content, so a passive scope closes it", () => {
    for (const code of [
      PERMISSIONS.SESSION_VIEW_CONTENT,
      PERMISSIONS.RECORDING_WATCH_RESTRICTED,
    ]) {
      expect(PERMISSION_META[code].content, code).toBe(true);
    }
  });

  it("hands course.hide and the permission to grant to no grant", () => {
    expect(PERMISSION_META[PERMISSIONS.COURSE_HIDE].grantable).toBe(false);
    expect(PERMISSION_META[PERMISSIONS.PERMISSION_GRANT].grantable).toBe(false);
    expect(PERMISSION_META[PERMISSIONS.MADRASAH_HIDE].grantable).toBe(false);
  });
});

describe("who holds the few codes the owner keeps to one role (review T6)", () => {
  const holders = (code: string) =>
    (
      Object.values(ASSIGNED_ROLES) as Array<
        keyof typeof ROLE_DEFAULT_PERMISSIONS
      >
    )
      .filter((role) =>
        (ROLE_DEFAULT_PERMISSIONS[role] as readonly string[]).includes(code)
      )
      .sort();

  it("only the köşk nazımı hides a course by default, and only the başmüderris hides a medrese", () => {
    expect(holders(PERMISSIONS.COURSE_HIDE)).toEqual([
      ASSIGNED_ROLES.KOSK_NAZIM,
    ]);
    expect(holders(PERMISSIONS.MADRASAH_HIDE)).toEqual([
      ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
    ]);
  });

  it("no role holds the platform's permissions by default", () => {
    for (const code of Object.values(PERMISSIONS)) {
      if (!code.startsWith("platform.")) continue;
      expect(holders(code), code).toEqual([]);
    }
  });

  it("the roles that give permissions are the three that run a scope, and no other", () => {
    expect(holders(PERMISSIONS.PERMISSION_GRANT)).toEqual(
      [
        ASSIGNED_ROLES.KOSK_NAZIM,
        ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
        ASSIGNED_ROLES.MUDERRIS,
      ].sort()
    );
  });
});
