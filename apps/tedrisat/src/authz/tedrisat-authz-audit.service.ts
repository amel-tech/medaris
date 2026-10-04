import type { AuthzAuditSink, IAuthzAuditEntry } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";

/**
 * Writes the audit rows a decision asks for (MDRS-135 §8): a read of course
 * content by someone who is neither an enrolled talebe nor the course's
 * müderris, a passive scope opened by platform management, a başnazım's read
 * of someone's private deck. It writes straight to `audit_log` through
 * `DatabaseService`, not through `AuditService`, which reaches the feature
 * modules `AuthzService` is built before.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TedrisatAuthzAudit implements AuthzAuditSink {
  constructor(private readonly databaseService: DatabaseService) {}

  async record(entry: IAuthzAuditEntry): Promise<void> {
    // A köşk or a medrese that is being opened has no id yet (`"new"`), and
    // `entity_id` holds a uuid: the row names the actor instead and keeps what
    // was meant in `details`. Left as it was, a refused self-seat on those
    // routes answered 500 where it should have answered 403 (MDRS-136).
    const named = UUID.test(entry.entityId);
    await this.databaseService.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: named ? entry.entityId : entry.actorId,
      details: named
        ? (entry.details ?? {})
        : { ...entry.details, resourceId: entry.entityId },
    });
  }
}
