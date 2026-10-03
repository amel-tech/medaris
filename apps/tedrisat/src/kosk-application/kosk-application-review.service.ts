import {
  AuthenticatedUser,
  ConflictError,
  ErrorContext,
  NotFoundError,
} from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import { PERMISSIONS } from "../assignment/permission-catalog";
import type { KoskApplicationField } from "../database/schema/kosk-application.schema";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { NotificationService } from "../notification/notification.service";
import { PlatformAccessService } from "../platform-access/platform-access.service";
import type {
  KoskApplicationDetailResponse,
  KoskApplicationListResponse,
  KoskApplicationTab,
} from "./dto/kosk-application-review.dto";
import {
  type IApplicationRow,
  KoskApplicationReviewRepository,
} from "./kosk-application-review.repository";

export class KoskApplicationNotFoundError extends NotFoundError {
  static readonly code = "KOSK_APPLICATION_NOT_FOUND";

  constructor(id: string, context?: ErrorContext) {
    super(
      KoskApplicationNotFoundError.code,
      `No köşk application ${id}`,
      context
    );
  }
}

/** Answered while the page was open: an answer is given once. */
export class KoskApplicationDecidedError extends ConflictError {
  static readonly code = "KOSK_APPLICATION_DECIDED";

  constructor(id: string, context?: ErrorContext) {
    super(
      KoskApplicationDecidedError.code,
      `Köşk application ${id} has been answered already`,
      context
    );
  }
}

const LIST_LIMIT = 100;

/** The köşk form spells a field in Turkish; the application stores a code. */
export const KOSK_FIELD_LABEL: Record<KoskApplicationField, string> = {
  ARABIC_LANGUAGE_SCIENCES: "Arapça dil ilimleri",
  RHETORIC: "Belâgat",
  FIQH: "Fıkıh",
  USUL_AL_FIQH: "Fıkıh usûlü",
  HADITH: "Hadis",
  QURAN_SCIENCES: "Kur'an ilimleri",
  TAFSIR: "Tefsir",
  AQEEDAH_KALAM: "Akaid ve kelâm",
  SEERAH: "Siyer",
  LOGIC: "Mantık",
  OTHER: "Diğer",
};

/**
 * Medaris management's side of "open a köşk" (MDRS-181, nizam/15). The
 * başnazım and a Medaris nazımı holding "Köşk başvurularını karara bağla" may
 * read and answer; the answer is given once, is written to the audit trail and
 * is told to the applicant. Seeing the applicant's e-mail and phone is itself
 * recorded: that is the note the screen prints.
 */
@Injectable()
export class KoskApplicationReviewService {
  private readonly logger = new Logger(KoskApplicationReviewService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: KoskApplicationReviewRepository,
    private readonly access: PlatformAccessService,
    private readonly notifications: NotificationService
  ) {}

  async list(
    user: AuthenticatedUser,
    tab: KoskApplicationTab
  ): Promise<KoskApplicationListResponse> {
    await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_KOSK_APPLICATION_DECIDE
    );
    const [rows, counts] = await Promise.all([
      this.repo.list(tab, LIST_LIMIT),
      this.repo.counts(),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        field: r.field,
        applicantName: r.applicantName,
        status: r.status,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
      })),
      pendingCount: counts.pending,
      decidedCount: counts.decided,
    };
  }

  /** The whole application with the applicant's contact details; the read is audited first. */
  async detail(
    user: AuthenticatedUser,
    id: string
  ): Promise<KoskApplicationDetailResponse> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_KOSK_APPLICATION_DECIDE
    );
    const row = await this.require(id);
    await this.repo.auditContactRead(actorId, {
      id: row.id,
      name: row.name,
      applicantId: row.applicantId,
    });
    const [roles, sameField] = await Promise.all([
      this.repo.rolesOf(row.applicantId),
      this.repo.koskNamesInField(
        KOSK_FIELD_LABEL[row.field as KoskApplicationField] ?? row.field
      ),
    ]);
    return {
      id: row.id,
      name: row.name,
      field: row.field,
      applicantName: row.applicantName,
      status: row.status,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      summary: row.summary,
      reason: row.reason,
      applicant: {
        id: row.applicantId,
        name: row.applicantName,
        email: row.email,
        phone: row.phone,
        roles,
      },
      sameFieldKosks: sameField,
      rejectReason: row.rejectReason,
      koskId: row.koskId,
    };
  }

  /** The köşk was opened from the application; the application is accepted with it. */
  async approve(
    user: AuthenticatedUser,
    id: string,
    koskId: string
  ): Promise<void> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_KOSK_APPLICATION_DECIDE
    );
    const row = await this.require(id);
    const koskName = await this.repo.koskName(koskId);
    if (koskName === null) throw new KoskNotFoundError(koskId);
    if (
      !(await this.repo.decide({
        id,
        actorId,
        outcome: "APPROVED",
        koskId,
        applicantName: row.applicantName ?? "",
        name: row.name,
      }))
    ) {
      throw new KoskApplicationDecidedError(id);
    }
    await this.tell(row, { outcome: "approved", koskName });
  }

  async reject(
    user: AuthenticatedUser,
    id: string,
    reason: string
  ): Promise<void> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_KOSK_APPLICATION_DECIDE
    );
    const row = await this.require(id);
    const trimmed = reason.trim();
    if (
      !(await this.repo.decide({
        id,
        actorId,
        outcome: "REJECTED",
        rejectReason: trimmed,
        applicantName: row.applicantName ?? "",
        name: row.name,
      }))
    ) {
      throw new KoskApplicationDecidedError(id);
    }
    await this.tell(row, {
      outcome: "rejected",
      koskName: row.name,
      reason: trimmed,
    });
  }

  private async require(id: string): Promise<IApplicationRow> {
    const row = await this.repo.find(id);
    if (!row) throw new KoskApplicationNotFoundError(id);
    return row;
  }

  /** Tells the applicant; a notification that fails never undoes the decision. */
  private async tell(
    row: IApplicationRow,
    params: Record<string, string>
  ): Promise<void> {
    try {
      await this.notifications.notify({
        userId: row.applicantId,
        type: "KOSK_APPLICATION_RESULT",
        params,
      });
    } catch (error) {
      this.logger.error("Could not notify of a köşk application answer", error);
    }
  }
}
