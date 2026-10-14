import type { IRefusedClientSource } from "@medaris/common";
import { Injectable, Logger } from "@nestjs/common";
import {
  type IRegisteredPartner,
  PARTNER_REGISTRY_TTL_MS,
} from "./domain/partner-registry";
import { PartnerRegistryRepository } from "./partner-registry.repository";

type Snapshot = ReadonlyMap<string, IRegisteredPartner>;

/**
 * The registered partner applications, read from the database and kept in
 * memory for a minute (`PARTNER_REGISTRY_TTL_MS`); every write in this process
 * empties it at once (`invalidate`), so the başnazım's change is in force on
 * the next request here and within the minute on any other instance.
 *
 * Why a cache when the authorization decisions have none (MDRS-46 measured
 * them and built none): this is read on every authenticated request, by
 * `AuthGuard`'s verifier (`isRefused`, a partner's token is refused on every
 * ordinary route) as well as by `PartnerGuard`, and it changes a few times a
 * year. One query a minute stands in for one per request. The köşk bindings
 * are not kept here: they are read with the query that needs them, so an
 * unbinding is in force at once everywhere.
 *
 * A read that fails while an older copy is held answers from that copy and
 * tries again on the next request; with no copy it throws, and the verifier
 * then refuses the token rather than let a partner's through.
 */
@Injectable()
export class PartnerRegistry implements IRefusedClientSource {
  private readonly logger = new Logger(PartnerRegistry.name);
  private snapshot: Snapshot | null = null;
  private loadedAt = 0;
  private pending: Promise<Snapshot> | null = null;
  // Bumped by `invalidate`: a read that started before a write does not
  // put its older answer back.
  private generation = 0;

  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly repo: PartnerRegistryRepository) {}

  /** Every registered partner by client id, enabled or not. */
  async all(): Promise<Snapshot> {
    if (this.snapshot && Date.now() - this.loadedAt < PARTNER_REGISTRY_TTL_MS) {
      return this.snapshot;
    }
    this.pending ??= this.load();
    return this.pending;
  }

  /** The partner registered under this client id, or null. */
  async find(clientId: string): Promise<IRegisteredPartner | null> {
    return (await this.all()).get(clientId) ?? null;
  }

  /**
   * `AuthGuard`'s verifier asks this for every token's `azp`: a registered
   * partner's token, enabled or not, is refused on every route but
   * `/integrations/*`.
   */
  async isRefused(clientId: string): Promise<boolean> {
    return (await this.all()).has(clientId);
  }

  /** Forgets what was read; the next read goes to the database. */
  invalidate(): void {
    this.generation += 1;
    this.snapshot = null;
    this.pending = null;
  }

  private async load(): Promise<Snapshot> {
    const generation = this.generation;
    try {
      const rows = await this.repo.all();
      const snapshot: Snapshot = new Map(
        rows.map((row) => [row.clientId, row])
      );
      if (generation === this.generation) {
        this.snapshot = snapshot;
        this.loadedAt = Date.now();
      }
      return snapshot;
    } catch (error) {
      if (this.snapshot) {
        this.logger.warn(
          `The partner registry could not be read; answering from the copy read ${Math.round((Date.now() - this.loadedAt) / 1000)}s ago: ${error instanceof Error ? error.message : String(error)}`
        );
        return this.snapshot;
      }
      throw error;
    } finally {
      if (generation === this.generation) this.pending = null;
    }
  }
}
