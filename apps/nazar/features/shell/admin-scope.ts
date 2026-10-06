import { notFound } from "next/navigation";
import { cache } from "react";
import { getViewer } from "~/features/account/reads";
import { isUuid } from "~/features/courses/courses";
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
  /** `GET /me`, or the başnazım's course, could not be read: the retry state */
  | { status: "failed" };

/**
 * Whether `GET /me` calls the caller the başnazım; null when it could not be
 * read, which is no answer either way (nazir 02, criterion 5).
 */
async function isAdmin(): Promise<boolean | null> {
  const me = await getViewer();
  return me ? me.roles.systemAdmin : null;
}

/**
 * The başnazım opens any course by its address (d-1001-06 "medaris başnazımı
 * nazir'e girebilir"); nobody else gains a scope this way. `GET /me` says who
 * he is, so a person with no `roles.systemAdmin` never makes the course read.
 * A course that is not there, or an address that names no course id, is the
 * portal's 404, as for anyone; the scope is built for this request only and
 * never joins the picker's list for `/`.
 */
export const adminCourseScope = cache(
  async (courseId: string): Promise<AdminScope> => {
    const admin = await isAdmin();
    if (admin === null) return { status: "failed" };
    if (!admin) return { status: "none" };
    // The route would answer a malformed id 400, which no retry mends.
    if (!isUuid(courseId)) notFound();
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

/**
 * The pages outside any scope (`/hesap`, `/bildirimler`) for a caller who
 * holds none. The frame of a course the başnazım opened by its address links
 * to both, so they open to him (`ok`); anyone else is sent to the no-access
 * page as before (`none`).
 */
export const adminOutsideScopes = cache(
  async (): Promise<"ok" | "none" | "failed"> => {
    const admin = await isAdmin();
    return admin === null ? "failed" : admin ? "ok" : "none";
  }
);
