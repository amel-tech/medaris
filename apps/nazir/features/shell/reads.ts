import {
  type AssignmentResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "~/lib/auth_options";
import { tedrisatApi } from "~/lib/tedrisat-api";
import type { MenuCounts } from "./nav";
import {
  buildScopes,
  displayName,
  heldRoles,
  type Person,
  type Scope,
} from "./scope";

/**
 * Server-side reads behind the portal's frame (MDRS-183). Not a `"use server"`
 * module: only server components and layouts call them.
 */
export type Portal =
  | {
      status: "ok";
      person: Person;
      assignments: AssignmentResponse[];
      scopes: Scope[];
      /** every role held, strongest first */
      roles: string[];
    }
  /** the roles could not be read: never "no access" (nazir 02, criterion 5) */
  | { status: "unavailable" };

/**
 * Who is signed in and which scopes they hold, once per request: the layout
 * and the page under it both ask. Any failure of the read is `unavailable`;
 * only a read that succeeded and found nothing sends a person to nazir 02.
 */
export const getPortal = cache(async (): Promise<Portal> => {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  try {
    const { me } = await tedrisatApi();
    const { assignments } = await me.getMyAssignments();
    return {
      status: "ok",
      person: {
        name: displayName(session.user),
        email: session.user.email ?? null,
      },
      assignments,
      scopes: buildScopes(assignments),
      roles: heldRoles(assignments),
    };
  } catch (error) {
    console.error("Error fetching the caller's assignments:", error);
    return { status: "unavailable" };
  }
});

/**
 * A count that could not be read is dropped. The nazırs of a medrese or of a
 * course are not all admitted to its count endpoint yet (the role matrix has
 * no row for MEDRESE_NAZIR and DERS_NAZIR), so a 403 is expected and quiet;
 * anything else is logged. Either way the menu loses a badge, not the page.
 */
const countOf = async (
  read: () => Promise<number>,
  label: string
): Promise<number | undefined> => {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof ResponseError && error.response.status === 403)) {
      console.error(`Error fetching the ${label} count:`, error);
    }
    return undefined;
  }
};

/**
 * The numbers behind the menu's badges. Dersler (a medrese) is the number of
 * courses holding an application, Celseler and Talebeler (a course) are the
 * sessions without a meeting link and the applications waiting, Bildirimler
 * is the caller's own unread count.
 */
export async function getMenuCounts(scope: Scope): Promise<MenuCounts> {
  let client: Awaited<ReturnType<typeof tedrisatApi>>;
  try {
    client = await tedrisatApi();
  } catch (error) {
    console.error("Error creating the API client for the menu counts:", error);
    return {};
  }

  const unread = countOf(
    async () => (await client.notifications.getNotificationCounts()).unread,
    "unread notification"
  );

  if (scope.kind === "medrese") {
    const counts = await Promise.all([
      unread,
      countOf(
        async () =>
          (await client.madrasahs.getMadrasahBadgeCounts({ id: scope.id }))
            .coursesWithPendingApplications,
        "medrese badge"
      ),
    ]);
    return { unread: counts[0], coursesWithApplications: counts[1] };
  }

  const course = client.courses.getCourseBadgeCounts({ id: scope.id });
  const counts = await Promise.all([
    unread,
    countOf(async () => (await course).missingMeetingLinks, "course badge"),
    countOf(async () => (await course).pendingApplications, "course badge"),
  ]);
  return {
    unread: counts[0],
    missingLinks: counts[1],
    applications: counts[2],
  };
}
