import {
  AuthenticatedUser,
  ConflictError,
  ErrorContext,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { PERMISSIONS } from "../assignment/permission-catalog";
import type { PlatformPolicyKey } from "../database/schema/platform-policy.schema";
import { PlatformAccessService } from "../platform-access/platform-access.service";
import type {
  PlatformPolicyListResponse,
  ScopedPolicyListResponse,
} from "./platform-policy.dto";
import { PlatformPolicyRepository } from "./platform-policy.repository";

/** A platform policy is on, so a scope below it may not switch the same rule off (MDRS-181). */
export class PlatformPolicyLockedError extends ConflictError {
  static readonly code = "PLATFORM_POLICY_LOCKED";

  constructor(key: string, context?: ErrorContext) {
    super(
      PlatformPolicyLockedError.code,
      `The platform policy ${key} is on; a köşk cannot switch it off`,
      context
    );
  }
}

/** What a köşk's own settings may ask for, as far as the platform policies allow. */
export interface IKoskPolicyChange {
  alwaysRequireApproval?: boolean;
  recordingsNeverPublic?: boolean;
}

/**
 * The platform policies (MDRS-181, nizam/19). A policy that is on closes a
 * permission for every scope below it: enrolments always wait for approval,
 * recordings are never public, and a köşk cannot switch the same rule off. The
 * enforcement reads (`isOn`, `assertKoskMayChange`) need no caller: they sit in
 * the paths of enrolling, of showing a recording and of saving a köşk.
 */
@Injectable()
export class PlatformPolicyService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: PlatformPolicyRepository,
    private readonly access: PlatformAccessService
  ) {}

  isOn(key: PlatformPolicyKey): Promise<boolean> {
    return this.repo.isOn(key);
  }

  /** Throws when the change would switch off a rule a platform policy holds on. */
  async assertKoskMayChange(change: IKoskPolicyChange): Promise<void> {
    if (
      change.alwaysRequireApproval === false &&
      (await this.repo.isOn("ALWAYS_REQUIRE_APPROVAL"))
    ) {
      throw new PlatformPolicyLockedError("ALWAYS_REQUIRE_APPROVAL");
    }
    if (
      change.recordingsNeverPublic === false &&
      (await this.repo.isOn("RECORDINGS_NEVER_PUBLIC"))
    ) {
      throw new PlatformPolicyLockedError("RECORDINGS_NEVER_PUBLIC");
    }
  }

  async list(user: AuthenticatedUser): Promise<PlatformPolicyListResponse> {
    await this.access.assert(user, PERMISSIONS.PLATFORM_POLICY_EDIT);
    const [rows, scoped] = await Promise.all([
      this.repo.all(),
      this.repo.scoped(),
    ]);
    return {
      items: rows.map((r) => ({
        key: r.key,
        enabled: r.enabled,
        changedBy: r.changedBy
          ? { id: r.changedBy, name: r.changedByName }
          : null,
        changedAt: r.changedAt,
        ownScopes: scoped
          .filter((s) => s.key === r.key)
          .map((s) => s.scopeName),
      })),
    };
  }

  /** Takes effect at once and is written to the audit trail in the same transaction. */
  async set(
    user: AuthenticatedUser,
    key: PlatformPolicyKey,
    enabled: boolean
  ): Promise<PlatformPolicyListResponse> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_POLICY_EDIT
    );
    await this.repo.set(key, enabled, actorId);
    return this.list(user);
  }

  async scoped(user: AuthenticatedUser): Promise<ScopedPolicyListResponse> {
    await this.access.assert(user, PERMISSIONS.PLATFORM_POLICY_EDIT);
    const rows = await this.repo.scoped();
    return {
      items: rows.map((r) => ({
        scope: { kind: "KOSK", id: r.scopeId, name: r.scopeName },
        key: r.key,
        openedBy: r.openedBy ? { id: r.openedBy, name: r.openedByName } : null,
        openedAt: r.openedAt,
      })),
    };
  }
}
