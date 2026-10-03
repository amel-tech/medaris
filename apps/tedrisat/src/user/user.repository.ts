import { Injectable } from "@nestjs/common";
import { desc, eq, InferSelectModel, or, sql } from "drizzle-orm";
import type { Tx } from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import { users } from "../database/schema/user.schema";
import { UserIdentity } from "./interfaces/token-claims.interface";

export type IUser = InferSelectModel<typeof users>;

export interface IUserSettings {
  timeZone?: string | null;
  locale?: string | null;
}

/**
 * How stale `last_seen_at` may get before a request with unchanged claims
 * writes it again. `UserSyncInterceptor` uses the same window for its
 * in-memory cache, so the database condition below is the backstop for what
 * the cache cannot see: a restart, or a second instance.
 */
export const LAST_SEEN_REFRESH_HOURS = 3;

@Injectable()
export class UserRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Inserts the user, or refreshes the token-owned columns of an existing
   * row. The `ON CONFLICT … DO UPDATE … WHERE` only writes when something
   * changed or `last_seen_at` has gone stale, so a cache miss on a
   * recently-seen user costs a read-sized statement, not a row rewrite.
   *
   * `locale` is taken from the token on insert only: after that it is the
   * user's own setting (`PATCH /me`), and the next token must not undo it.
   */
  async upsert(identity: UserIdentity): Promise<void> {
    await this.db
      .insert(users)
      .values({
        id: identity.id,
        email: identity.email,
        emailVerified: identity.emailVerified,
        givenName: identity.givenName,
        familyName: identity.familyName,
        locale: identity.locale,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: sql`excluded.email`,
          emailVerified: sql`excluded.email_verified`,
          givenName: sql`excluded.given_name`,
          familyName: sql`excluded.family_name`,
          lastSeenAt: sql`now()`,
        },
        setWhere: or(
          sql`${users.email} is distinct from excluded.email`,
          sql`${users.emailVerified} is distinct from excluded.email_verified`,
          sql`${users.givenName} is distinct from excluded.given_name`,
          sql`${users.familyName} is distinct from excluded.family_name`,
          sql`${users.lastSeenAt} < now() - make_interval(hours => ${LAST_SEEN_REFRESH_HOURS})`
        ),
      });
  }

  async findById(id: string): Promise<IUser | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Exact, case-insensitive match — never a prefix or pattern, so the lookup
   * cannot be used to list accounts. At most one row: should two accounts
   * carry the same address (Keycloak re-issued it before the old row was
   * refreshed), the one seen most recently is the current holder.
   */
  async findByEmail(email: string): Promise<IUser | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .orderBy(desc(users.lastSeenAt))
      .limit(1);
    return rows[0] ?? null;
  }

  /** `executor` is the caller's transaction when the write must commit with others. */
  async updateSettings(
    id: string,
    settings: IUserSettings,
    executor: DatabaseService["db"] | Tx = this.db
  ): Promise<IUser | null> {
    const rows = await executor
      .update(users)
      .set(settings)
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
