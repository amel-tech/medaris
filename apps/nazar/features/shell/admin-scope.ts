import { cache } from "react";
import { getViewer } from "~/features/account/reads";
import { readOnce } from "~/lib/tedrisat-read";
import type { Scope } from "./scope";

/**
 * A course the başnazım opens by its address, with no seat in it (MDRS-270).
 * Not a `"use server"` module: only the layout calls it.
 */
export type AdminScope =
  | { status: "ok"; scope: Scope }
  /** not the başnazım: the layout goes on as before */
  | { status: "none" }
  /** the başnazım, but the course could not be read: the retry state */
  | { status: "failed" };

/**
 * The başnazım opens any course by its address (d-1001-06 "medaris başnazımı
 * nazir'e girebilir"); nobody else gains a scope this way. `GET /me` says who
 * he is, so a person with no `roles.systemAdmin` never makes the course read.
 * A course that is not there is the portal's 404, as for anyone; the scope is
 * built for this request only and never joins the picker's list for `/`.
 */
export const adminCourseScope = cache(
  async (courseId: string): Promise<AdminScope> => {
    const me = await getViewer();
    if (!me?.roles.systemAdmin) return { status: "none" };
    const course = await readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    );
    if (course.status !== "ok") return { status: "failed" };
    return {
      status: "ok",
      scope: {
        kind: "ders",
        id: course.data.id,
        name: course.data.title,
        role: "SYSTEM_ADMIN",
        isImam: false,
        koskName: null,
      },
    };
  }
);
