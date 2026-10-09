import { notFound } from "next/navigation";
import { cache } from "react";
import { isUuid } from "~/features/courses/courses";
import { readOnce } from "~/lib/tedrisat-read";
import { type AdminScope, adminScope } from "./admin-scope";
import { getPortal } from "./reads";
import { findScope, type ScopeKind } from "./scope";

/**
 * A course of a medrese the caller holds a seat in, opened by its address:
 * its başmüderris and its nazırs open every course of their medrese, though
 * they hold no seat in the course itself (a ders nazırı post is refused to
 * them, `COURSE_NAZIR_HOLDS_SEAT`). The course is their scope for that page
 * only, under their medrese role; what they may do there is the API's answer
 * on each page, from the permissions the medrese gave them. Someone with no
 * medrese seat makes no read; a course of another medrese, or one the API
 * refuses them, is the portal's 404.
 */
export const medreseCourseScope = cache(
  async (courseId: string): Promise<AdminScope> => {
    const portal = await getPortal();
    if (portal.status !== "ok") return { status: "failed" };
    const medreses = portal.scopes.filter((s) => s.kind === "medrese");
    if (medreses.length === 0) return { status: "none" };
    // The route would answer a malformed id 400, which no retry mends.
    if (!isUuid(courseId)) notFound();
    const course = await readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    );
    if (course.status === "forbidden") return { status: "none" };
    if (course.status !== "ok") return { status: "failed" };
    const medrese = course.data.madrasah
      ? findScope(medreses, "medrese", course.data.madrasah.id)
      : undefined;
    if (!medrese) return { status: "none" };
    return {
      status: "ok",
      scope: {
        kind: "ders",
        id: course.data.id,
        name: course.data.title,
        role: medrese.role,
        isImam: false,
        koskName: null,
      },
    };
  }
);

/**
 * A scope a page is opened in by its address though the caller holds no seat
 * in it: any medrese or course for the başnazım, else a course of their own
 * medrese for its başmüderris and its nazırs.
 */
export const openedScope = cache(
  async (kind: ScopeKind, id: string): Promise<AdminScope> => {
    const admin = await adminScope(kind, id);
    if (admin.status !== "none" || kind !== "ders") return admin;
    return medreseCourseScope(id);
  }
);
