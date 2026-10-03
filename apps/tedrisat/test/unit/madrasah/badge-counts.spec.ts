import {
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  type AuthzMeta,
  type AuthzRequest,
  ENTITIES,
  MATRIX,
  ROLES,
  SCOPES,
} from "@medaris/common";
import type { ModuleRef } from "@nestjs/core";
import { MadrasahNotFoundError } from "../../../src/madrasah/errors/madrasah-not-found.error";
import { MadrasahController } from "../../../src/madrasah/madrasah.controller";
import { MadrasahRepository } from "../../../src/madrasah/madrasah.repository";
import { MadrasahService } from "../../../src/madrasah/madrasah.service";
import { recordingDatabase } from "../../helpers/recording-database";

const MADRASAH_ID = "5b0f6c1e-7a3d-4f2b-9c51-2d8e4a6b1f00";

/**
 * MDRS-183: `GET /madrasahs/:id/badge-counts`, the numbers behind the nazır
 * portal's menu. The route's database behaviour is covered end to end in
 * test/e2e/badge-counts.e2e.spec.ts; these run without a container.
 */
describe("MadrasahRepository.getBadgeCounts", () => {
  it("counts the PENDING requests of the medrese's visible courses, and the courses holding one", async () => {
    const { databaseService, queries } = recordingDatabase(() => [["3", "2"]]);

    const counts = await new MadrasahRepository(databaseService).getBadgeCounts(
      MADRASAH_ID
    );

    expect(counts).toEqual({
      pendingApplications: 3,
      coursesWithPendingApplications: 2,
    });
    expect(queries).toHaveLength(1);
    const [{ text, values }] = queries;
    expect(text).toContain('count(distinct "enrollments"."course_id")');
    expect(text).toContain('"courses"."madrasah_id" = $1');
    // A hidden course is no medrese's pending work (MDRS-124).
    expect(text).toContain('"courses"."archived_at" is null');
    expect(text).toContain('"enrollments"."status" = $2');
    expect(values).toEqual([MADRASAH_ID, "PENDING"]);
  });

  it("answers zero for a medrese with no requests", async () => {
    const { databaseService } = recordingDatabase(() => [["0", "0"]]);

    await expect(
      new MadrasahRepository(databaseService).getBadgeCounts(MADRASAH_ID)
    ).resolves.toEqual({
      pendingApplications: 0,
      coursesWithPendingApplications: 0,
    });
  });
});

describe("MadrasahService.getBadgeCounts", () => {
  it("answers an unknown medrese as not-found without counting", async () => {
    const getBadgeCounts = vi.fn();
    const service = new MadrasahService({
      exists: async () => false,
      getBadgeCounts,
    } as unknown as MadrasahRepository);

    await expect(service.getBadgeCounts(MADRASAH_ID)).rejects.toBeInstanceOf(
      MadrasahNotFoundError
    );
    expect(getBadgeCounts).not.toHaveBeenCalled();
  });
});

describe("GET /madrasahs/:id/badge-counts authorization", () => {
  const handler = MadrasahController.prototype.getBadgeCounts;
  const meta = Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta;

  it("is never open to a caller with no token", () => {
    // `@AuthzPublic()` is what lets a request through without a token; this
    // route carries the class-level AuthGuard and nothing that lifts it.
    expect(Reflect.getMetadata(AUTHZ_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it("requires a scope only a medrese's nazır holds", () => {
    expect(meta.scope).toBe(SCOPES.VIEW_MADRASAH_ANALYTICS);
    const holders = Object.entries(MATRIX[ENTITIES.MADRASAH])
      .filter(([, scopes]) => scopes?.includes(meta.scope))
      .map(([role]) => role);
    // A stranger (PUBLIC) and a caller with no token (ANONYMOUS) get 403.
    expect(holders).toEqual([ROLES.MADRASAH_NAZIR]);
  });

  describe("its resolver", () => {
    const moduleRefWhere = (exists: boolean) =>
      ({ get: () => ({ exists: async () => exists }) }) as unknown as ModuleRef;
    const request = (id: string) => ({ params: { id } }) as AuthzRequest;

    it("answers a malformed id as not-found, not 403", async () => {
      await expect(
        meta.resolve(request("not-a-uuid"), moduleRefWhere(true))
      ).rejects.toBeInstanceOf(MadrasahNotFoundError);
    });

    it("answers an unknown medrese as not-found, not 403", async () => {
      await expect(
        meta.resolve(request(MADRASAH_ID), moduleRefWhere(false))
      ).rejects.toBeInstanceOf(MadrasahNotFoundError);
    });

    it("authorizes against the medrese in the path", async () => {
      await expect(
        meta.resolve(request(MADRASAH_ID), moduleRefWhere(true))
      ).resolves.toEqual({ entity: ENTITIES.MADRASAH, id: MADRASAH_ID });
    });
  });
});
