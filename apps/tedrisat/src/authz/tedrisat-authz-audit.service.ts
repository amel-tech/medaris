import type { AuthzAuditSink, IAuthzAuditEntry } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // `entity_id` is a uuid column. A create route has no row yet and is
    // decided against the `forNew` sentinel ("new"): its entry is filed under
    // the person who acted, which the audit page reads as the platform's, and
    // what it was about stays in the details. Writing the sentinel would fail
    // the insert and turn a refusal into a 500 with no row.
    const known = UUID_REGEX.test(entry.entityId);
    await this.databaseService.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: known ? entry.entity : "user",
      entityId: known ? entry.entityId : entry.actorId,
      details: known
        ? (entry.details ?? {})
        : {
            ...entry.details,
            about: { entity: entry.entity, id: entry.entityId },
          },
    });
  }
}
