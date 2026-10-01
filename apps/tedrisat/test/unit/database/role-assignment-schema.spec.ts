import { getTableConfig } from "drizzle-orm/pg-core";
import { courses } from "../../../src/database/schema/course.schema";
import { kosks } from "../../../src/database/schema/kosk.schema";
import { madrasahs } from "../../../src/database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  ROLE_SCOPE_TYPES,
  SCOPE_TYPES,
} from "../../../src/database/schema/role-assignment.schema";

/**
 * MDRS-134: the foreign keys the migration's e2e cannot tell apart from the
 * SQL alone — what each one points at, and what a delete of the target does
 * to the row. Reading them through `getTableConfig` resolves the schema's
 * reference callbacks the way drizzle-kit does.
 */
const foreignKeysOf = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).foreignKeys.map((fk) => {
    const ref = fk.reference();
    return {
      columns: ref.columns.map((c) => c.name),
      target: getTableConfig(ref.foreignTable).name,
      onDelete: fk.onDelete,
    };
  });

describe("role model v2 schema (MDRS-134)", () => {
  it("links a course to at most one medrese, and a deleted medrese leaves the course standing", () => {
    expect(foreignKeysOf(courses)).toContainEqual({
      columns: ["madrasah_id"],
      target: getTableConfig(madrasahs).name,
      onDelete: "set null",
    });
    expect(
      getTableConfig(courses).columns.find((c) => c.name === "madrasah_id")
        ?.notNull
    ).toBe(false);
  });

  it("drops a hosting right with either end of it", () => {
    expect(foreignKeysOf(madrasahKoskHosting)).toEqual([
      {
        columns: ["madrasah_id"],
        target: getTableConfig(madrasahs).name,
        onDelete: "cascade",
      },
      {
        columns: ["kosk_id"],
        target: getTableConfig(kosks).name,
        onDelete: "cascade",
      },
    ]);
  });

  it("gives every role exactly the scope the model names", () => {
    expect(ROLE_SCOPE_TYPES).toEqual({
      [ASSIGNED_ROLES.MEDARIS_NAZIM]: SCOPE_TYPES.PLATFORM,
      [ASSIGNED_ROLES.KOSK_NAZIM]: SCOPE_TYPES.KOSK,
      [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS]: SCOPE_TYPES.MADRASAH,
      [ASSIGNED_ROLES.MEDRESE_NAZIR]: SCOPE_TYPES.MADRASAH,
      [ASSIGNED_ROLES.MUDERRIS]: SCOPE_TYPES.COURSE,
      [ASSIGNED_ROLES.DERS_NAZIR]: SCOPE_TYPES.COURSE,
    });
  });
});
