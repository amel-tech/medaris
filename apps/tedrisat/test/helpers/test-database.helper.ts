import { DatabaseService } from "../../src/database/database.service";
import {
  AssignedRole,
  ROLE_SCOPE_TYPES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";

/**
 * Gives `userId` a role in a scope with a direct insert (MDRS-134) — what a
 * test that inserts a köşk or a course row directly, instead of through the
 * API, needs so that its manager or müderris is one. `POST /kosks` and the
 * course writes grant these themselves.
 */
export async function assignRole(
  db: DatabaseService["db"],
  grant: {
    userId: string;
    role: AssignedRole;
    scopeId: string;
    grantedBy?: string;
    isImam?: boolean;
  }
): Promise<void> {
  await db.insert(roleAssignments).values({
    userId: grant.userId,
    role: grant.role,
    scopeType: ROLE_SCOPE_TYPES[grant.role],
    scopeId: grant.scopeId,
    grantedBy: grant.grantedBy ?? grant.userId,
    isImam: grant.isImam ?? false,
  });
}

/**
 * Every table under a köşk, children first, then `kosks` itself, led by
 * `role_assignments` (MDRS-134): its `scope_id` is no foreign key, so a
 * köşk's or course's roles would otherwise outlive the rows they name. Pass it to
 * `cleanTables` instead of plain `"kosks"`: since MDRS-124 the foreign keys
 * under a köşk are `ON DELETE RESTRICT`, so `DELETE FROM kosks` fails while a
 * course remains — and `cleanTables` only warns on failure, which would leave
 * one test's rows in the next.
 */
export const COURSE_TREE_TABLES = [
  "role_assignments",
  "enrollments",
  "course_resources",
  "lesson_recordings",
  "lesson_invitations",
  "course_muderris",
  "lessons",
  "course_weeks",
  "courses",
  "kosks",
] as const;

/**
 * Utility class for managing test database operations
 */
export class TestDatabaseUtils {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Cleans all data from the test database
   * This is more thorough than individual table cleanup
   */
  async cleanDatabase(): Promise<void> {
    if (!this.databaseService?.db) {
      console.warn("Database service not available for cleanup");
      return;
    }

    try {
      // Get all table names from the database
      const result = await this.databaseService.db.execute(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename != '__drizzle_migrations'
      `);

      // Disable foreign key checks temporarily
      await this.databaseService.db.execute(
        "SET session_replication_role = replica"
      );

      // Truncate all tables
      if (result.rows && Array.isArray(result.rows)) {
        for (const row of result.rows) {
          if (
            row &&
            typeof row === "object" &&
            "tablename" in row &&
            typeof row.tablename === "string"
          ) {
            await this.databaseService.db.execute(
              `TRUNCATE TABLE "${row.tablename}" RESTART IDENTITY CASCADE`
            );
          }
        }
      }

      // Re-enable foreign key checks
      await this.databaseService.db.execute(
        "SET session_replication_role = DEFAULT"
      );

      console.log("Database cleaned successfully");
    } catch (error) {
      console.warn("Database cleanup failed:", error);
      // Don't throw to avoid breaking tests
    }
  }

  /**
   * Cleans specific tables
   */
  async cleanTables(...tableNames: string[]): Promise<void> {
    if (!this.databaseService?.db) {
      console.warn("Database service not available for table cleanup");
      return;
    }

    try {
      for (const tableName of tableNames) {
        await this.databaseService.db.execute(`DELETE FROM "${tableName}"`);
      }
      console.log(`Tables cleaned: ${tableNames.join(", ")}`);
    } catch (error) {
      console.warn("Table cleanup failed:", error);
    }
  }

  /**
   * Checks if the database connection is healthy
   */
  async checkConnection(): Promise<boolean> {
    if (!this.databaseService?.db) {
      return false;
    }

    try {
      await this.databaseService.db.execute("SELECT 1");
      return true;
    } catch (error) {
      console.error("Database connection check failed:", error);
      return false;
    }
  }
}
