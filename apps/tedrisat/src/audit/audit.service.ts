import { AuthenticatedUser, ROLES } from "@medaris/common";
import { BadRequestException, Injectable } from "@nestjs/common";
import { PERMISSIONS } from "../assignment/permission-catalog";
import { KeycloakAdminService } from "../keycloak-admin/keycloak-admin.service";
import { PlatformAccessService } from "../platform-access/platform-access.service";
import type { AuditEntryResponse, AuditPageResponse } from "./audit.dto";
import {
  AuditRepository,
  type IAuditCursor,
  type IAuditEntry,
  type IAuditFilter,
  type IAuditRow,
} from "./audit.repository";
import { auditCsv, auditTypeOf } from "./audit-types";

export const AUDIT_PAGE_SIZE = 50;
/** One export is capped so a download cannot turn into a table dump. */
export const AUDIT_EXPORT_MAX = 10000;
const CHIEF_CACHE_MS = 5 * 60_000;
export const AUDIT_EXPORT_ACTION = "audit.export";

const UUID_TEXT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque to clients: base64url of `<created_at text>|<id>`. */
export const encodeAuditCursor = (cursor: IAuditCursor): string =>
  Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url");

export function decodeAuditCursor(raw: string): IAuditCursor {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const bar = text.lastIndexOf("|");
  const createdAt = text.slice(0, bar);
  const id = text.slice(bar + 1);
  if (
    bar < 1 ||
    !UUID_TEXT.test(id) ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$/.test(
      createdAt
    )
  ) {
    throw new BadRequestException("The cursor is not one this list gave out");
  }
  return { createdAt, id };
}

/**
 * The platform's audit trail. Every module that needs a record calls
 * `record()`; the only way to read the trail is `list()` and `export()`,
 * which belong to the başnazım and to a Medaris nazımı holding "Denetim
 * kaydını oku". A köşk nazımı or a başmüderris is a 403. Nothing here
 * updates or deletes a row.
 */
@Injectable()
export class AuditService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: AuditRepository,
    private readonly access: PlatformAccessService,
    private readonly keycloak: KeycloakAdminService
  ) {}

  private chiefs: { ids: Set<string>; at: number } | null = null;

  /**
   * Who holds SYSTEM_ADMIN. The role lives in the realm, not in the
   * database, so the directory is asked and the answer kept a few minutes.
   * Not reaching it is an answer too (nobody), so the trail still renders.
   */
  private async systemAdminIds(): Promise<Set<string>> {
    if (this.chiefs && Date.now() - this.chiefs.at < CHIEF_CACHE_MS) {
      return this.chiefs.ids;
    }
    let ids = new Set<string>();
    try {
      if (this.keycloak.isConfigured()) {
        const holders = await this.keycloak.findByRealmRole(ROLES.SYSTEM_ADMIN);
        ids = new Set(holders.map((h) => h.id));
      }
    } catch {
      ids = new Set();
    }
    this.chiefs = { ids, at: Date.now() };
    return ids;
  }

  /** Appends one row. */
  record(entry: IAuditEntry): Promise<void> {
    return this.repo.insert(entry);
  }

  async list(
    user: AuthenticatedUser,
    filter: IAuditFilter,
    cursor?: string
  ): Promise<AuditPageResponse> {
    await this.access.assert(user, PERMISSIONS.PLATFORM_AUDIT_READ);
    const rows = await this.repo.list(
      filter,
      cursor ? decodeAuditCursor(cursor) : undefined,
      AUDIT_PAGE_SIZE + 1
    );
    const page = rows.slice(0, AUDIT_PAGE_SIZE);
    const last = page[page.length - 1];
    return {
      items: await this.present(page),
      nextCursor:
        rows.length > AUDIT_PAGE_SIZE && last
          ? encodeAuditCursor({ createdAt: last.createdAtText, id: last.id })
          : null,
    };
  }

  /** The filtered records as CSV. The export is itself a record, written once the rows are read. */
  async export(user: AuthenticatedUser, filter: IAuditFilter): Promise<string> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_AUDIT_READ
    );
    const rows = await this.repo.list(filter, undefined, AUDIT_EXPORT_MAX);
    const items = await this.present(rows);
    await this.repo.insert({
      actorId,
      action: AUDIT_EXPORT_ACTION,
      entity: "audit",
      entityId: actorId,
      details: { rows: items.length, filter: serializeFilter(filter) },
    });
    return auditCsv(
      items.map((e) => ({
        number: e.number,
        createdAt: e.createdAt,
        actorName: e.actor.name,
        actorRole: e.actor.role,
        type: e.type,
        action: e.action,
        scopeKind: e.scope.kind,
        scopeName: e.scope.name,
      }))
    );
  }

  private async present(rows: IAuditRow[]): Promise<AuditEntryResponse[]> {
    const roles = await this.repo.rolesOf([
      ...new Set(rows.map((r) => r.actorId)),
    ]);
    // The head nazim is the widest role there is, whatever kosk role the same
    // person also holds.
    const chiefs = await this.systemAdminIds();
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      createdAt: r.createdAt,
      actor: {
        id: r.actorId,
        name: r.actorName,
        role: chiefs.has(r.actorId)
          ? ROLES.SYSTEM_ADMIN
          : (roles.get(r.actorId) ?? null),
      },
      type: auditTypeOf(r.action),
      action: r.action,
      details: r.details,
      scope: { kind: r.scopeKind, id: r.scopeId, name: r.scopeName },
    }));
  }
}

const serializeFilter = (filter: IAuditFilter): Record<string, string> => {
  const out: Record<string, string> = {};
  if (filter.actor) out.actor = filter.actor;
  if (filter.type) out.type = filter.type;
  if (filter.scope) out.scope = filter.scope;
  if (filter.from) out.from = filter.from.toISOString();
  if (filter.to) out.to = filter.to.toISOString();
  return out;
};
