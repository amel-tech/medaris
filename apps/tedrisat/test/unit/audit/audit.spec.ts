import {
  decodeAuditCursor,
  encodeAuditCursor,
} from "../../../src/audit/audit.service";
import {
  AUDIT_TYPE_RULES,
  AUDIT_TYPES,
  auditCsv,
  auditTypeOf,
  auditTypeRule,
  csvCell,
} from "../../../src/audit/audit-types";
import type { PlatformAccessService } from "../../../src/platform-access/platform-access.service";
import type { PlatformPolicyRepository } from "../../../src/platform-policy/platform-policy.repository";
import {
  PlatformPolicyLockedError,
  PlatformPolicyService,
} from "../../../src/platform-policy/platform-policy.service";

/**
 * MDRS-181. The kinds the audit page filters by are a table, and the label of
 * a row and the SQL filter both read it, so the table is pinned here.
 */
describe("the kind of an audit row", () => {
  it.each([
    ["course.content_read", "CONTENT_READ"],
    ["scope.passive_open", "CONTENT_READ"],
    ["deck.private-read", "PRIVATE_DECK_READ"],
    ["deck.admin_read", "PRIVATE_DECK_READ"],
    ["deck.unpublish", "HIDE"],
    ["permission.self_grant_refused", "SELF_GRANT_REFUSED"],
    ["kosk_application.contact_read", "PERSONAL_DATA_READ"],
    ["course.roster_read", "PERSONAL_DATA_READ"],
    ["user.lookup", "USER_LOOKUP"],
    ["permission.grant", "GRANT"],
    ["permission_group.delete", "GRANT"],
    ["medaris_nazim.appoint", "ROLE_CHANGE"],
    ["kosk.nazim.add", "ROLE_CHANGE"],
    ["kosk.nazim.remove", "ROLE_CHANGE"],
    ["madrasah_nazir.appoint", "ROLE_CHANGE"],
    ["madrasah_nazir.dismiss", "ROLE_CHANGE"],
    ["madrasah.head_muderris.set", "ROLE_CHANGE"],
    ["platform_policy.change", "POLICY_CHANGE"],
    ["kosk.policy_change", "POLICY_CHANGE"],
    ["ban.create", "BAN"],
    ["ban.extend", "BAN"],
    ["ban.lift", "BAN"],
    ["kosk.hide", "HIDE"],
    ["madrasah.restore", "HIDE"],
    ["hosting_right.grant", "HOSTING"],
    ["permission.take_over", "TAKEOVER"],
    ["appeal.decide", "APPEAL"],
    ["permanent_ban.request", "PERMANENT_BAN"],
    ["course.delete", "PERMANENT_DELETE"],
    ["kosk.delete", "PERMANENT_DELETE"],
    ["audit.export", "EXPORT"],
    ["lesson.cancel", "OTHER"],
    ["kosk.create", "OTHER"],
  ])("%s is %s", (action, type) => {
    expect(auditTypeOf(action)).toBe(type);
  });

  it("lets only the first kind claim an action, as the SQL exclusion says", () => {
    // `permission_group.delete` matches `%.delete` but belongs to GRANT.
    expect(auditTypeOf("permission_group.delete")).toBe("GRANT");
    expect(auditTypeRule("PERMANENT_DELETE").unless).toContain(
      "permission_group.delete"
    );
    // `permission.take_over` matches `permission.%` but belongs to TAKEOVER.
    expect(auditTypeOf("permission.take_over")).toBe("TAKEOVER");
    // …and the SQL filter of GRANT leaves out every action an earlier kind
    // claims, so the filter and the label agree: a refused self-grant is not
    // listed as a grant that was made.
    for (const action of [
      "permission.take_over",
      "permission.drop",
      "permission.self_grant_refused",
    ]) {
      expect(auditTypeRule("GRANT").unless, action).toContain(action);
    }
  });

  it("lists every kind once, with OTHER last", () => {
    expect(new Set(AUDIT_TYPES).size).toBe(AUDIT_TYPES.length);
    expect(AUDIT_TYPES.at(-1)).toBe("OTHER");
    expect(AUDIT_TYPES.length).toBe(Object.keys(AUDIT_TYPE_RULES).length + 1);
  });
});

describe("the CSV of the trail", () => {
  it("quotes what needs it and keeps a spreadsheet from running a cell as a formula", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("writes a header and one CRLF line a row", () => {
    const csv = auditCsv([
      {
        number: 7,
        createdAt: new Date("2026-09-29T18:10:00Z"),
        actorName: "=Ayşe",
        actorRole: null,
        type: "BAN",
        action: "ban.create",
        scopeKind: "KOSK",
        scopeName: "Fatih, Köşkü",
      },
    ]);
    expect(csv).toBe(
      "no,time,actor,actor_role,type,action,scope_kind,scope_name\r\n" +
        `7,2026-09-29T18:10:00.000Z,'=Ayşe,,BAN,ban.create,KOSK,"Fatih, Köşkü"\r\n`
    );
    expect(auditCsv([])).toBe(
      "no,time,actor,actor_role,type,action,scope_kind,scope_name\r\n"
    );
  });
});

describe("the page cursor", () => {
  const id = "b0000000-0000-4000-8000-0000000000aa";
  const ts = "2026-09-29 18:10:00.123456+00";

  it("round-trips the database's own timestamp text, so no precision is lost", () => {
    expect(decodeAuditCursor(encodeAuditCursor({ createdAt: ts, id }))).toEqual(
      {
        createdAt: ts,
        id,
      }
    );
  });

  it.each([
    ["not base64 of anything", "%%%"],
    ["no separator", Buffer.from("nothing").toString("base64url")],
    ["a bad id", Buffer.from(`${ts}|nope`).toString("base64url")],
    ["a bad time", Buffer.from(`yesterday|${id}`).toString("base64url")],
  ])("refuses %s", (_label, raw) => {
    expect(() => decodeAuditCursor(raw)).toThrow(/cursor/);
  });
});

describe("platform policies reaching down to a köşk", () => {
  const service = (on: Record<string, boolean>) =>
    new PlatformPolicyService(
      {
        isOn: vi.fn(async (key: string) => on[key] ?? false),
      } as unknown as PlatformPolicyRepository,
      {} as unknown as PlatformAccessService
    );

  it("refuses a köşk switching off a rule the platform holds on", async () => {
    const policies = service({ ALWAYS_REQUIRE_APPROVAL: true });
    await expect(
      policies.assertKoskMayChange({ alwaysRequireApproval: false })
    ).rejects.toBeInstanceOf(PlatformPolicyLockedError);
    await expect(
      policies.assertKoskMayChange({
        alwaysRequireApproval: false,
        recordingsNeverPublic: true,
      })
    ).rejects.toMatchObject({ code: "PLATFORM_POLICY_LOCKED" });
  });

  it("lets it keep, raise or leave alone what the platform holds, and change what the platform does not", async () => {
    const policies = service({ ALWAYS_REQUIRE_APPROVAL: true });
    await expect(
      policies.assertKoskMayChange({ alwaysRequireApproval: true })
    ).resolves.toBeUndefined();
    await expect(policies.assertKoskMayChange({})).resolves.toBeUndefined();
    await expect(
      policies.assertKoskMayChange({ recordingsNeverPublic: false })
    ).resolves.toBeUndefined();
    await expect(
      service({}).assertKoskMayChange({ alwaysRequireApproval: false })
    ).resolves.toBeUndefined();
  });

  it("locks each rule on its own", async () => {
    await expect(
      service({ RECORDINGS_NEVER_PUBLIC: true }).assertKoskMayChange({
        recordingsNeverPublic: false,
      })
    ).rejects.toBeInstanceOf(PlatformPolicyLockedError);
  });
});
