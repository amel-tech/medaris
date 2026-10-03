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
@Injectable()
export class TedrisatAuthzAudit implements AuthzAuditSink {
  constructor(private readonly databaseService: DatabaseService) {}

  async record(entry: IAuthzAuditEntry): Promise<void> {
    await this.databaseService.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      details: entry.details ?? {},
    });
  }
}
