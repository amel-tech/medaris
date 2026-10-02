import { Injectable } from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { notifications } from "../database/schema/notification.schema";
import type { NotificationCursor } from "./notification-cursor";
import type {
  INotification,
  NotificationInput,
  NotificationStatus,
} from "./notification-types";

@Injectable()
export class NotificationRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * `created_at` is set here, to the millisecond, not by the column default:
   * the list is paged on `(created_at, id)` and its cursor is a JavaScript
   * Date.
   */
  async insert(input: NotificationInput[]): Promise<void> {
    if (input.length === 0) return;
    const createdAt = new Date();
    await this.db.insert(notifications).values(
      input.map((n) => ({
        userId: n.userId,
        type: n.type,
        targetType: n.targetType ?? null,
        targetId: n.targetId ?? null,
        params: n.params ?? {},
        createdAt,
      }))
    );
  }

  /** One person's rows, newest first; one more than `limit` to know whether a page follows. */
  async findPage(
    userId: string,
    options: {
      status: NotificationStatus;
      cursor: NotificationCursor | null;
      limit: number;
      /** only these types; empty keeps every type */
      types?: string[];
    }
  ): Promise<INotification[]> {
    const { status, cursor, limit, types } = options;
    return this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          status === "unread" ? isNull(notifications.readAt) : undefined,
          types && types.length > 0
            ? inArray(notifications.type, types)
            : undefined,
          cursor
            ? or(
                lt(notifications.createdAt, cursor.createdAt),
                and(
                  eq(notifications.createdAt, cursor.createdAt),
                  lt(notifications.id, cursor.id)
                )
              )
            : undefined
        )
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);
  }

  /** `types` narrows what is counted; empty counts every type. */
  async counts(
    userId: string,
    types?: string[]
  ): Promise<{ unread: number; total: number }> {
    const [row] = await this.db
      .select({
        total: count(),
        unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)`,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          types && types.length > 0
            ? inArray(notifications.type, types)
            : undefined
        )
      );
    return { total: Number(row.total), unread: Number(row.unread) };
  }

  /**
   * Marks one of `userId`'s notifications read and returns it; one already
   * read keeps its first `readAt`. Null when the caller has no such row.
   */
  async markRead(userId: string, id: string): Promise<INotification | null> {
    const [row] = await this.db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return row ?? null;
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt))
      )
      .returning({ id: notifications.id });
    return rows.length;
  }
}
