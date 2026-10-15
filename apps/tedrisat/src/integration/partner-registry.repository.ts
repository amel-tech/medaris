import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import {
  integrationPartnerKosks,
  integrationPartners,
} from "../database/schema/integration-partner.schema";
import { kosks } from "../database/schema/kosk.schema";
import { partnerCourseCodes } from "../database/schema/partner-enrollment.schema";
import { PLATFORM_ENTITY_ID } from "../platform-policy/platform-policy.repository";
import { partnerActorDetails } from "./domain/partner-actor";
import { PARTNER_CODE_REMOVE_ACTION } from "./domain/partner-enrollment";
import {
  BOOT_ACTOR_ID,
  type IRegisteredPartner,
  PARTNER_CREATE_ACTION,
  PARTNER_DISABLE_ACTION,
  PARTNER_ENABLE_ACTION,
  PARTNER_KOSK_BIND_ACTION,
  PARTNER_KOSK_UNBIND_ACTION,
  PARTNER_RENAME_ACTION,
} from "./domain/partner-registry";

type Tx = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

export interface IKoskRef {
  id: string;
  name: string;
}

/** A partner as nizam's "Ortak uygulamalar" lists it. */
export interface IPartnerAdminRow extends IRegisteredPartner {
  createdAt: Date;
  kosks: IKoskRef[];
}

/**
 * What `setKosks` did: the köşks bound and unbound, and how many of the
 * partner's codes went with the unbound ones; or why it did nothing.
 */
export type KoskBindingResult =
  | {
      kind: "done";
      bound: IKoskRef[];
      unbound: IKoskRef[];
      removedCodes: number;
    }
  | { kind: "no-partner" }
  | { kind: "no-kosk"; koskId: string };

/** The audit row's details of a partner: `name` is what the audit page prints under the action. */
const partnerDetails = (partner: { clientId: string; name: string }) => ({
  clientId: partner.clientId,
  name: partner.name,
});

/**
 * The partner registry's two tables (migration 0064): the partner
 * applications and the köşks each works with. Every write is one transaction
 * with its audit rows. The cache in front of the reads is `PartnerRegistry`'s;
 * whoever writes here invalidates it.
 */
@Injectable()
export class PartnerRegistryRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Every registered partner, enabled or not; the cache's one read. */
  async all(): Promise<IRegisteredPartner[]> {
    return this.db
      .select({
        clientId: integrationPartners.clientId,
        name: integrationPartners.name,
        enabled: integrationPartners.enabled,
      })
      .from(integrationPartners)
      .orderBy(asc(integrationPartners.clientId));
  }

  /** Every partner with its köşks, by name, for nizam. */
  async listForAdmin(): Promise<IPartnerAdminRow[]> {
    const [partners, bindings] = await Promise.all([
      this.db
        .select()
        .from(integrationPartners)
        .orderBy(
          asc(integrationPartners.name),
          asc(integrationPartners.clientId)
        ),
      this.db
        .select({
          clientId: integrationPartnerKosks.clientId,
          id: kosks.id,
          name: kosks.name,
        })
        .from(integrationPartnerKosks)
        .innerJoin(kosks, eq(kosks.id, integrationPartnerKosks.koskId))
        .orderBy(asc(kosks.name), asc(kosks.id)),
    ]);
    return partners.map((partner) => ({
      clientId: partner.clientId,
      name: partner.name,
      enabled: partner.enabled,
      createdAt: partner.createdAt,
      kosks: bindings
        .filter((binding) => binding.clientId === partner.clientId)
        .map(({ id, name }) => ({ id, name })),
    }));
  }

  /** Every köşk, by name: what the başnazım picks a partner's köşks from. */
  async koskOptions(): Promise<IKoskRef[]> {
    return this.db
      .select({ id: kosks.id, name: kosks.name })
      .from(kosks)
      .orderBy(asc(kosks.name), asc(kosks.id));
  }

  /** Registers a partner, enabled, with its audit row; false when the id is taken. */
  async create(
    partner: { clientId: string; name: string },
    actorId: string
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [added] = await tx
        .insert(integrationPartners)
        .values({ ...partner, createdBy: actorId })
        .onConflictDoNothing()
        .returning({ clientId: integrationPartners.clientId });
      if (!added) return false;
      await tx.insert(auditLog).values({
        actorId,
        action: PARTNER_CREATE_ACTION,
        entity: "integration_partner",
        entityId: PLATFORM_ENTITY_ID,
        details: partnerDetails(partner),
      });
      return true;
    });
  }

  /**
   * Renames, disables or enables a partner, one audit row per change; a value
   * it has already is no change. Null when there is no such partner.
   */
  async update(
    clientId: string,
    change: { name?: string; enabled?: boolean },
    actorId: string
  ): Promise<IRegisteredPartner | null> {
    return this.db.transaction(async (tx) => {
      const [held] = await tx
        .select()
        .from(integrationPartners)
        .where(eq(integrationPartners.clientId, clientId))
        .for("update");
      if (!held) return null;
      const name = change.name ?? held.name;
      const enabled = change.enabled ?? held.enabled;
      if (name !== held.name || enabled !== held.enabled) {
        await tx
          .update(integrationPartners)
          .set({ name, enabled })
          .where(eq(integrationPartners.clientId, clientId));
      }
      const rows: { action: string; details: Record<string, unknown> }[] = [];
      if (name !== held.name) {
        rows.push({
          action: PARTNER_RENAME_ACTION,
          details: { ...partnerDetails({ clientId, name }), was: held.name },
        });
      }
      if (enabled !== held.enabled) {
        rows.push({
          action: enabled ? PARTNER_ENABLE_ACTION : PARTNER_DISABLE_ACTION,
          details: partnerDetails({ clientId, name }),
        });
      }
      if (rows.length > 0) {
        await tx.insert(auditLog).values(
          rows.map((row) => ({
            actorId,
            entity: "integration_partner",
            entityId: PLATFORM_ENTITY_ID,
            ...row,
          }))
        );
      }
      return { clientId, name, enabled };
    });
  }

  /**
   * Makes the partner's köşks exactly these: binds the new ones and unbinds
   * the rest, one audit row per köşk, under the köşk, so the köşk's own
   * audit filter shows it.
   *
   * Unbinding a köşk also takes the partner's codes off that köşk's courses,
   * in the same transaction, one `course.partner_code_remove` row each: left
   * in place they could be neither seen nor removed from Ders ayarları, and a
   * code is unique per partner, so it could not be mapped in another köşk
   * either. Binding the köşk again brings none of them back. The
   * registrations' links stay: the partner's DELETE still undoes the seats
   * they made.
   */
  async setKosks(
    clientId: string,
    koskIds: readonly string[],
    actorId: string
  ): Promise<KoskBindingResult> {
    return this.db.transaction(async (tx) => {
      const [partner] = await tx
        .select()
        .from(integrationPartners)
        .where(eq(integrationPartners.clientId, clientId))
        .for("update");
      if (!partner) return { kind: "no-partner" as const };

      const wanted = [...new Set(koskIds.map((id) => id.toLowerCase()))];
      const named =
        wanted.length === 0
          ? []
          : await tx
              .select({ id: kosks.id, name: kosks.name })
              .from(kosks)
              .where(inArray(kosks.id, wanted));
      const missing = wanted.find((id) => !named.some((k) => k.id === id));
      if (missing) return { kind: "no-kosk" as const, koskId: missing };

      const held = await tx
        .select({ id: kosks.id, name: kosks.name })
        .from(integrationPartnerKosks)
        .innerJoin(kosks, eq(kosks.id, integrationPartnerKosks.koskId))
        .where(eq(integrationPartnerKosks.clientId, clientId));
      const bound = named.filter((k) => !held.some((h) => h.id === k.id));
      const unbound = held.filter((h) => !wanted.includes(h.id));

      if (bound.length > 0) {
        await tx.insert(integrationPartnerKosks).values(
          bound.map((kosk) => ({
            clientId,
            koskId: kosk.id,
            createdBy: actorId,
          }))
        );
      }
      let removedCodes = 0;
      if (unbound.length > 0) {
        await tx.delete(integrationPartnerKosks).where(
          and(
            eq(integrationPartnerKosks.clientId, clientId),
            inArray(
              integrationPartnerKosks.koskId,
              unbound.map((kosk) => kosk.id)
            )
          )
        );
        removedCodes = await removeKoskCodes(tx, actorId, partner, unbound);
      }
      await recordBindings(tx, actorId, partner, bound, unbound);
      return { kind: "done" as const, bound, unbound, removedCodes };
    });
  }

  /**
   * Seeds one partner from `INTEGRATION_PARTNERS` at boot: registers it,
   * enabled, unless a partner with its id is registered already, and only then
   * binds it to every köşk that holds a course one of its codes is mapped to,
   * so a partner that worked before this release keeps working. A partner
   * registered already is left exactly as it is: the başnazım's disabling or
   * unbinding is never undone by a restart. Null when nothing was seeded.
   */
  async seed(partner: {
    clientId: string;
    name: string;
  }): Promise<{ kosks: IKoskRef[] } | null> {
    return this.db.transaction(async (tx) => {
      const [added] = await tx
        .insert(integrationPartners)
        .values({ ...partner, createdBy: null })
        .onConflictDoNothing()
        .returning({ clientId: integrationPartners.clientId });
      if (!added) return null;

      const held = await tx
        .selectDistinct({ id: kosks.id, name: kosks.name })
        .from(partnerCourseCodes)
        .innerJoin(courses, eq(courses.id, partnerCourseCodes.courseId))
        .innerJoin(kosks, eq(kosks.id, courses.koskId))
        .where(eq(partnerCourseCodes.partnerClientId, partner.clientId));
      if (held.length > 0) {
        await tx
          .insert(integrationPartnerKosks)
          .values(
            held.map((kosk) => ({
              clientId: partner.clientId,
              koskId: kosk.id,
              createdBy: null,
            }))
          )
          .onConflictDoNothing();
      }
      const seededFrom = "INTEGRATION_PARTNERS";
      await tx.insert(auditLog).values({
        actorId: BOOT_ACTOR_ID,
        action: PARTNER_CREATE_ACTION,
        entity: "integration_partner",
        entityId: PLATFORM_ENTITY_ID,
        details: { ...partnerDetails(partner), seededFrom },
      });
      await recordBindings(tx, BOOT_ACTOR_ID, partner, held, [], {
        seededFrom,
      });
      return { kosks: held };
    });
  }
}

/**
 * Takes the partner's codes off the courses of the köşks it was just unbound
 * from, with the audit row staff's own removal writes for each (under the
 * course, naming the partner and the köşk). Returns how many went.
 */
async function removeKoskCodes(
  tx: Tx,
  actorId: string,
  partner: { clientId: string; name: string },
  unbound: readonly IKoskRef[]
): Promise<number> {
  const held = await tx
    .select({
      id: partnerCourseCodes.id,
      code: partnerCourseCodes.code,
      courseId: partnerCourseCodes.courseId,
      koskId: courses.koskId,
    })
    .from(partnerCourseCodes)
    .innerJoin(courses, eq(courses.id, partnerCourseCodes.courseId))
    .where(
      and(
        eq(partnerCourseCodes.partnerClientId, partner.clientId),
        inArray(
          courses.koskId,
          unbound.map((kosk) => kosk.id)
        )
      )
    );
  if (held.length === 0) return 0;
  await tx.delete(partnerCourseCodes).where(
    inArray(
      partnerCourseCodes.id,
      held.map((row) => row.id)
    )
  );
  await tx.insert(auditLog).values(
    held.map((row) => ({
      actorId,
      action: PARTNER_CODE_REMOVE_ACTION,
      entity: "course",
      entityId: row.courseId,
      details: {
        ...partnerActorDetails(partner),
        code: row.code,
        // Why it went: the köşk was unbound, not a removal on the course.
        unboundKosk: unbound.find((kosk) => kosk.id === row.koskId)?.name,
      },
    }))
  );
  return held.length;
}

async function recordBindings(
  tx: Tx,
  actorId: string,
  partner: { clientId: string; name: string },
  bound: readonly IKoskRef[],
  unbound: readonly IKoskRef[],
  extra: Record<string, unknown> = {}
): Promise<void> {
  const rows = [
    ...bound.map((kosk) => ({ kosk, action: PARTNER_KOSK_BIND_ACTION })),
    ...unbound.map((kosk) => ({ kosk, action: PARTNER_KOSK_UNBIND_ACTION })),
  ];
  if (rows.length === 0) return;
  await tx.insert(auditLog).values(
    rows.map(({ kosk, action }) => ({
      actorId,
      action,
      entity: "kosk",
      entityId: kosk.id,
      details: { ...partnerDetails(partner), kosk: kosk.name, ...extra },
    }))
  );
}
