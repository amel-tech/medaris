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
import { CourseController } from "../../../src/course/course.controller";
import { CourseRepository } from "../../../src/course/course.repository";
import { CourseNotFoundError } from "../../../src/course/errors/course-not-found.error";
import { recordingDatabase } from "../../helpers/recording-database";

const COURSE_ID = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const KOSK_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

/**
 * MDRS-183: `GET /courses/:id/badge-counts`, the numbers behind the nazır
 * portal's course menu. The route's database behaviour is covered end to end
 * in test/e2e/badge-counts.e2e.spec.ts; these run without a container.
 */
describe("CourseRepository.getBadgeCounts", () => {
  const rowsFor = (text: string) =>
    text.includes('from "enrollments"') ? [["2"]] : [["1"]];

  it("counts pending requests and the sessions still waiting for a link", async () => {
    const { databaseService, queries } = recordingDatabase(rowsFor);

    const counts = await new CourseRepository(databaseService).getBadgeCounts(
      COURSE_ID
    );

    expect(counts).toEqual({ missingMeetingLinks: 1, pendingApplications: 2 });
    expect(queries).toHaveLength(2);
  });

  it("counts only PENDING enrollments of this course", async () => {
    const { databaseService, queries } = recordingDatabase(rowsFor);
    await new CourseRepository(databaseService).getBadgeCounts(COURSE_ID);

    const pending = queries.find((q) => q.text.includes('from "enrollments"'));
    expect(pending?.text).toContain('"enrollments"."course_id" = $1');
    expect(pending?.text).toContain('"enrollments"."status" = $2');
    expect(pending?.values).toEqual([COURSE_ID, "PENDING"]);
  });

  it("counts a live session only while it is ahead, standing, visible and without a link", async () => {
    const { databaseService, queries } = recordingDatabase(rowsFor);
    await new CourseRepository(databaseService).getBadgeCounts(COURSE_ID);

    const missing = queries.find((q) => q.text.includes('from "lessons"'));
    const text = missing?.text ?? "";
    expect(text).toContain('"course_weeks"."course_id" = $1');
    // A hidden week or lesson is gone from the programme.
    expect(text).toContain('"course_weeks"."archived_at" is null');
    expect(text).toContain('"lessons"."archived_at" is null');
    // A cancelled session needs no link (MDRS-158).
    expect(text).toContain('"lessons"."cancelled_at" is null');
    expect(text).toContain('"lessons"."type" = $2');
    // Still ahead; one already under way is past help.
    expect(text).toContain('"lessons"."scheduled_at" >= now()');
    // A link of spaces is no link.
    expect(text).toContain(
      '("lessons"."meeting_url" is null or btrim("lessons"."meeting_url") = \'\')'
    );
    expect(missing?.values).toEqual([COURSE_ID, "LIVE"]);
  });

  it("answers zero for a course with nothing outstanding", async () => {
    const { databaseService } = recordingDatabase(() => [["0"]]);

    await expect(
      new CourseRepository(databaseService).getBadgeCounts(COURSE_ID)
    ).resolves.toEqual({ missingMeetingLinks: 0, pendingApplications: 0 });
  });
});

describe("GET /courses/:id/badge-counts authorization", () => {
  const handler = CourseController.prototype.badgeCounts;
  const meta = Reflect.getMetadata(AUTHZ_KEY, handler) as AuthzMeta;

  it("is never open to a caller with no token", () => {
    expect(Reflect.getMetadata(AUTHZ_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it("requires the scope of the course team and nobody below it", () => {
    expect(meta.scope).toBe(SCOPES.MANAGE_ENROLLMENTS);
    const holders = Object.entries(MATRIX[ENTITIES.COURSE])
      .filter(([, scopes]) => scopes?.includes(meta.scope))
      .map(([role]) => role)
      .sort();
    // A talebe (ENROLLED, PENDING), a stranger (PUBLIC) and a caller with no
    // token (ANONYMOUS) get 403.
    expect(holders).toEqual([ROLES.KOSK_MANAGER, ROLES.MUDERRIS].sort());
  });

  describe("its resolver", () => {
    const moduleRefWhere = (koskId: string | null) =>
      ({
        get: () => ({ findKoskId: async () => koskId }),
      }) as unknown as ModuleRef;
    const request = (id: string) => ({ params: { id } }) as AuthzRequest;

    it("answers a malformed id as not-found, not 403", async () => {
      await expect(
        meta.resolve(request("not-a-uuid"), moduleRefWhere(KOSK_ID))
      ).rejects.toBeInstanceOf(CourseNotFoundError);
    });

    it("answers an unknown course as not-found, not 403", async () => {
      await expect(
        meta.resolve(request(COURSE_ID), moduleRefWhere(null))
      ).rejects.toBeInstanceOf(CourseNotFoundError);
    });

    it("authorizes against the course in the path", async () => {
      await expect(
        meta.resolve(request(COURSE_ID), moduleRefWhere(KOSK_ID))
      ).resolves.toEqual({ entity: ENTITIES.COURSE, id: COURSE_ID });
    });
  });
});
