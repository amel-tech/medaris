import { Injectable } from "@nestjs/common";
import { NotificationNotFoundError } from "./errors/notification-not-found.error";
import { NotificationRepository } from "./notification.repository";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "./notification-cursor";
import {
  type INotification,
  type NotificationInput,
  type NotificationStatus,
} from "./notification-types";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

@Injectable()
export class NotificationService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly repo: NotificationRepository) {}

  /**
   * The producers' entry point (MDRS-167): one notification per recipient,
   * written together. Not called by any module yet.
   */
  async notify(...input: NotificationInput[]): Promise<void> {
    await this.repo.insert(input);
  }

  async list(
    userId: string,
    options: {
      status: NotificationStatus;
      cursor?: string;
      limit: number;
      types?: string[];
    }
  ): Promise<{ items: INotification[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit, 1), MAX_PAGE_SIZE);
    const rows = await this.repo.findPage(userId, {
      status: options.status,
      cursor: options.cursor ? decodeNotificationCursor(options.cursor) : null,
      limit,
      types: options.types,
    });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeNotificationCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  counts(
    userId: string,
    types?: string[]
  ): Promise<{ unread: number; total: number }> {
    return this.repo.counts(userId, types);
  }

  async markRead(userId: string, id: string): Promise<INotification> {
    const row = await this.repo.markRead(userId, id);
    if (!row) throw new NotificationNotFoundError(id);
    return row;
  }

  async markAllRead(
    userId: string,
    types?: string[]
  ): Promise<{ updated: number }> {
    return { updated: await this.repo.markAllRead(userId, types) };
  }
}
