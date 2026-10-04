import { ENTITIES } from "@medaris/common";
import { TedrisatAuthzContext } from "../../../src/authz/tedrisat-authz-context.service";
import { recordingDatabase } from "../../helpers/recording-database";

/**
 * MDRS-135 §7: what one authorization decision costs. The loader answers
 * everything the engine needs about a resource and a caller in a bounded number
 * of statements however many scopes, grants or groups there are, so a decision
 * is never N+1. These run without a container: the statements are recorded and
 * answered with rows in column order.
 */
const USER = "d7000000-0000-4000-8000-000000000001";
const KOSK = "d7000000-0000-4000-8000-0000000000a1";
const MADRASAH = "d7000000-0000-4000-8000-0000000000a2";
const COURSE = "d7000000-0000-4000-8000-0000000000a3";

type Answers = Partial<
  Record<"facts" | "roles" | "grants" | "managers" | "policies", unknown[][]>
>;

const which = (text: string) => {
  if (text.includes('"platform_policies"')) return "policies";
  if (text.includes('"permission_grants"')) return "grants";
  if (text.includes("count(*)")) return "managers";
  if (text.includes('"role_assignments"')) return "roles";
  return "facts";
};

const build = (answers: Answers = {}) => {
  const { databaseService, queries } = recordingDatabase(
    (text) => answers[which(text)] ?? []
  );
  return { loader: new TedrisatAuthzContext(databaseService), queries };
};

describe("TedrisatAuthzContext", () => {
  it("answers a course in five statements: its row, then roles, grants, managers and platform policies", async () => {
    const { loader, queries } = build({
      facts: [[KOSK, MADRASAH, false, false, false, false, false]],
    });
    await loader.load(USER, { entity: ENTITIES.COURSE, id: COURSE });
    expect(queries).toHaveLength(5);
    expect(queries.map((q) => which(q.text)).sort()).toEqual(
      ["facts", "grants", "managers", "policies", "roles"].sort()
    );
  });

  it("asks nothing about a resource that is no row (the create and list sentinels): roles, grants and policies only", async () => {
    const { loader, queries } = build();
    const ctx = await loader.load(USER, { entity: ENTITIES.KOSK, id: "new" });
    expect(ctx.chain).toEqual([{ type: "platform", id: null }]);
    expect(queries.map((q) => which(q.text)).sort()).toEqual(
      ["grants", "policies", "roles"].sort()
    );
  });

  it("puts a medrese course in both its medrese and its köşk, narrowest first, and ends at the platform", async () => {
    const { loader } = build({
      facts: [[KOSK, MADRASAH, false, false, false, false, false]],
    });
    const ctx = await loader.load(USER, {
      entity: ENTITIES.COURSE,
      id: COURSE,
    });
    expect(ctx.chain).toEqual([
      { type: "course", id: COURSE },
      { type: "madrasah", id: MADRASAH },
      { type: "kosk", id: KOSK },
      { type: "platform", id: null },
    ]);
    expect(ctx.madrasahCourse).toBe(true);
  });

  it("leaves the medrese out of a course the köşk holds on its own", async () => {
    const { loader } = build({
      facts: [[KOSK, null, false, false, null, null, null]],
    });
    const ctx = await loader.load(USER, {
      entity: ENTITIES.COURSE,
      id: COURSE,
    });
    expect(ctx.chain.map((s) => s.type)).toEqual([
      "course",
      "kosk",
      "platform",
    ]);
    expect(ctx.madrasahCourse).toBe(false);
  });

  it("reads the policies that are on, at the level that set them", async () => {
    const { loader } = build({
      facts: [[KOSK, MADRASAH, true, false, false, true, true]],
      policies: [["RECORDINGS_NEVER_PUBLIC"], ["SOMETHING_ELSE"]],
    });
    const ctx = await loader.load(USER, {
      entity: ENTITIES.COURSE,
      id: COURSE,
    });
    expect(ctx.policies).toEqual(
      expect.arrayContaining([
        { key: "RECORDINGS_NEVER_PUBLIC", level: "platform", scopeId: null },
        { key: "ALWAYS_REQUIRE_APPROVAL", level: "kosk", scopeId: KOSK },
        {
          key: "RECORDINGS_NEVER_PUBLIC",
          level: "madrasah",
          scopeId: MADRASAH,
        },
        { key: "CLOSED_COURSE_REQUIRED", level: "madrasah", scopeId: MADRASAH },
      ])
    );
    // A platform policy key the engine does not know closes nothing.
    expect(ctx.policies).toHaveLength(4);
  });

  it("is passive in the first scope on the chain that once had a manager and has none now", async () => {
    const { loader } = build({
      facts: [[KOSK, null, false, false, null, null, null]],
      // [scope id, role, ever held, held now]
      managers: [
        [KOSK, "KOSK_NAZIM", 1, 0],
        [COURSE, "MUDERRIS", 2, 1],
      ],
    });
    const ctx = await loader.load(USER, {
      entity: ENTITIES.COURSE,
      id: COURSE,
    });
    expect(ctx.passiveScope).toEqual({ type: "kosk", id: KOSK });
  });

  it("is not passive when a scope never had a manager, or still has one", async () => {
    const never = build({
      facts: [[KOSK, null, false, false, null, null, null]],
      managers: [],
    });
    expect(
      (await never.loader.load(USER, { entity: ENTITIES.COURSE, id: COURSE }))
        .passiveScope
    ).toBeNull();
    const held = build({
      facts: [[KOSK, null, false, false, null, null, null]],
      managers: [[KOSK, "KOSK_NAZIM", 2, 1]],
    });
    expect(
      (await held.loader.load(USER, { entity: ENTITIES.COURSE, id: COURSE }))
        .passiveScope
    ).toBeNull();
  });

  it("merges a group's rows into one grant and keeps only codes the catalogue knows", async () => {
    const { loader } = build({
      facts: [[KOSK, MADRASAH, false, false, false, false, false]],
      roles: [["MEDRESE_NAZIR", "madrasah", MADRASAH]],
      // [grant id, scope type, scope id, single permission, authority, group item]
      grants: [
        ["g1", "madrasah", MADRASAH, null, "madrasah", "madrasah.ban"],
        ["g1", "madrasah", MADRASAH, null, "madrasah", "course.edit"],
        ["g1", "madrasah", MADRASAH, null, "madrasah", "not.a_code"],
        ["g2", "course", COURSE, "session.manage", null, null],
      ],
    });
    const ctx = await loader.load(USER, {
      entity: ENTITIES.COURSE,
      id: COURSE,
    });
    expect(ctx.roles).toEqual([
      { role: "MEDRESE_NAZIR", scope: { type: "madrasah", id: MADRASAH } },
    ]);
    expect(ctx.grants).toEqual([
      {
        scope: { type: "madrasah", id: MADRASAH },
        authority: "madrasah",
        codes: ["madrasah.ban", "course.edit"],
      },
      {
        scope: { type: "course", id: COURSE },
        authority: null,
        codes: ["session.manage"],
      },
    ]);
  });

  it("hands the engine each role's and grant's end, so a giver's holding is known to last only until then (review B-grants-R2-2)", async () => {
    const end = new Date("2026-10-05T10:00:00Z");
    const { loader } = build({
      facts: [[KOSK, MADRASAH, false, false, false, false, false]],
      // [role, scope type, scope id, end]
      roles: [["MEDRESE_NAZIR", "madrasah", MADRASAH, end]],
      // [grant id, scope type, scope id, single permission, authority, group item, end]
      grants: [
        ["g1", "madrasah", MADRASAH, "course.edit", "platform", null, end],
      ],
    });
    const ctx = await loader.load(USER, {
      entity: ENTITIES.COURSE,
      id: COURSE,
    });
    expect(ctx.roles).toEqual([
      {
        role: "MEDRESE_NAZIR",
        scope: { type: "madrasah", id: MADRASAH },
        expiresAt: end,
      },
    ]);
    expect(ctx.grants).toEqual([
      {
        scope: { type: "madrasah", id: MADRASAH },
        authority: "platform",
        expiresAt: end,
        codes: ["course.edit"],
      },
    ]);
  });

  it("decides expiry and revocation in the statements, against the database clock, not in memory", async () => {
    const { loader, queries } = build({
      facts: [[KOSK, null, false, false, null, null, null]],
    });
    await loader.load(USER, { entity: ENTITIES.COURSE, id: COURSE });
    const sqlOf = (kind: string) =>
      queries.find((q) => which(q.text) === kind)?.text ?? "";
    for (const kind of ["roles", "grants"]) {
      expect(sqlOf(kind), kind).toContain('"revoked_at" is null');
      expect(sqlOf(kind), kind).toContain("now()");
    }
  });

  it("asks for the caller's roles in terms the partial indexes on user_id serve, with or without a chain", async () => {
    // `role_assignments_held_platform_idx` is `where scope_id is null` and
    // `role_assignments_held_scoped_idx` is `where scope_id is not null`: a
    // `scope_type = 'platform'` arm matches neither, and the planner read every
    // row ever assigned on each decision (measured on Postgres 17 with 50k
    // rows: a Seq Scan of 872 buffers against a BitmapOr of 5).
    for (const resource of [
      { entity: ENTITIES.COURSE, id: COURSE },
      { entity: ENTITIES.KOSK, id: "new" },
    ]) {
      const { loader, queries } = build({
        facts: [[KOSK, null, false, false, null, null, null]],
      });
      await loader.load(USER, resource);
      const roles = queries.find((q) => which(q.text) === "roles")?.text ?? "";
      expect(roles, resource.id).toContain(
        '"role_assignments"."scope_id" is null'
      );
      expect(roles, resource.id).not.toContain('"scope_type" =');
    }
  });
});
