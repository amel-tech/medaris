import { TedrisatAuthzAudit } from "../../../src/authz/tedrisat-authz-audit.service";
import type { DatabaseService } from "../../../src/database/database.service";

const ACTOR = "d7100000-0000-4000-8000-000000000001";
const KOSK = "d7100000-0000-4000-8000-0000000000a1";

const build = () => {
  const rows: Record<string, unknown>[] = [];
  const databaseService = {
    db: {
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          rows.push(row);
        },
      }),
    },
  } as unknown as DatabaseService;
  return { sink: new TedrisatAuthzAudit(databaseService), rows };
};

describe("TedrisatAuthzAudit", () => {
  it("writes an entry about an existing row as it is", async () => {
    const { sink, rows } = build();
    await sink.record({
      actorId: ACTOR,
      action: "permission.self_grant_refused",
      entity: "kosk",
      entityId: KOSK,
      details: { route: "kosk.grants.create" },
    });
    expect(rows).toEqual([
      {
        actorId: ACTOR,
        action: "permission.self_grant_refused",
        entity: "kosk",
        entityId: KOSK,
        details: { route: "kosk.grants.create" },
      },
    ]);
  });

  // `audit_log.entity_id` is a uuid: the create sentinel would fail the insert
  // with 22P02 and turn a 403 into a 500 with no row.
  it("files an entry about a row not created yet under the actor, keeping what it was about", async () => {
    const { sink, rows } = build();
    await sink.record({
      actorId: ACTOR,
      action: "permission.self_grant_refused",
      entity: "kosk",
      entityId: "new",
      details: { route: "kosk.create" },
    });
    expect(rows).toEqual([
      {
        actorId: ACTOR,
        action: "permission.self_grant_refused",
        entity: "user",
        entityId: ACTOR,
        details: {
          route: "kosk.create",
          about: { entity: "kosk", id: "new" },
        },
      },
    ]);
  });
});
