import {
  describeStatement,
  summariseStatements,
} from "../../helpers/statement-counter";

/**
 * MDRS-46: the grouped summary the measurement spec prints names a statement
 * after the table it reads, and a later work package diffs that summary. A
 * select whose select list holds a subquery (`KoskRepository.findById` puts
 * the holders of the köşk there) must be named after its own table, not the
 * subquery's.
 */
describe("describeStatement", () => {
  it("names a plain select after its table", () => {
    expect(
      describeStatement('select "id" from "role_assignments" where "id" = $1')
    ).toBe("select role_assignments");
  });

  it("names a select after its own table when the select list holds a subquery", () => {
    const text =
      'select "id", "owner_id", coalesce((select array_agg("user_id") from "role_assignments" where "scope_id" = "kosks"."id"), \'{}\') as "nazims" from "kosks" where "id" = $1';
    expect(describeStatement(text)).toBe("select kosks");
  });

  it("is not thrown off by parentheses or quotes inside a string literal", () => {
    const text =
      "select coalesce((select '(' from \"role_assignments\"), ')') from \"kosks\"";
    expect(describeStatement(text)).toBe("select kosks");
  });

  it("names an insert and an update after their table", () => {
    expect(
      describeStatement(
        'insert into "audit_log" ("id") values ($1) returning "id"'
      )
    ).toBe("insert audit_log");
    expect(
      describeStatement('update "users" set "name" = $1 where "id" = $2')
    ).toBe("update users");
  });

  it("names a statement with no table by its verb", () => {
    expect(describeStatement("begin")).toBe("begin");
    expect(describeStatement("select 1")).toBe("select");
  });
});

describe("summariseStatements", () => {
  it("does not credit a subquery's table with the outer select", () => {
    const koskRead =
      'select "id", (select count(*) from "role_assignments") as "n" from "kosks" where "id" = $1';
    const roles =
      'select "user_id" from "role_assignments" where "user_id" = $1';
    expect(summariseStatements([koskRead, roles, koskRead])).toBe(
      "select kosks x2, select role_assignments"
    );
  });
});
