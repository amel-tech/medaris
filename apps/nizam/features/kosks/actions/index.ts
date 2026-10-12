"use server";

import {
  type CourseDetailResponse,
  type CourseSummaryResponse,
  type CreateKoskDto,
  KoskManagedBy,
  type KoskResponse,
  type MeResponse,
  type PaginatedKoskResponse,
  type PendingEnrollmentResponse,
  type RemovedEnrollmentResponse,
  type RosterEnrollmentResponse,
  type UpdateKoskDto,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
  succeeded,
} from "~/lib/authenticated-action";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * The köşks the caller manages, a page at a time (MDRS-108). nizam is where a
 * köşk is run, so its list is never the whole catalogue — tedris lists that.
 */
export const getManagedKosks = async (
  page = 1,
  limit = 12
): Promise<PaginatedKoskResponse> => {
  try {
    const { kosks } = await tedrisatApi();
    return await kosks.getAllKosks({
      page,
      limit,
      managedBy: KoskManagedBy.Me,
    });
  } catch (error) {
    // The shell's read: see `OnRefused`.
    await passOnSignIn(error, "fail");
    console.error("Error fetching köşks:", error);
    return { items: [], total: 0, page, limit };
  }
};

export const getKoskById = async (
  koskId: string
): Promise<KoskResponse | null> => {
  try {
    const { kosks } = await tedrisatApi();
    return await kosks.getKoskById({ id: koskId });
  } catch (error) {
    await passOnSignIn(error);
    console.error("Error fetching köşk:", error);
    return null;
  }
};

export const getCourse = async (
  courseId: string
): Promise<CourseDetailResponse | null> => {
  try {
    const { courses } = await tedrisatApi();
    return await courses.getCourseById({ id: courseId });
  } catch (error) {
    await passOnSignIn(error);
    console.error("Error fetching course:", error);
    return null;
  }
};

export const createKosk = async (
  kosk: CreateKoskDto
): Promise<AuthenticatedActionResult<KoskResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.createKosk({ createKoskDto: kosk })
  );
  if (succeeded(result)) revalidatePath("/kosks");
  return result;
};

export const updateKosk = async (
  koskId: string,
  kosk: UpdateKoskDto
): Promise<AuthenticatedActionResult<KoskResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.updateKosk({ id: koskId, updateKoskDto: kosk })
  );
  if (succeeded(result)) {
    revalidatePath("/kosks");
    revalidatePath(`/kosks/${koskId}`);
  }
  return result;
};

export const getKoskCourses = async (
  koskId: string
): Promise<CourseSummaryResponse[]> => {
  try {
    const { courses } = await tedrisatApi();
    return await courses.getCoursesByKosk({ koskId });
  } catch (error) {
    await passOnSignIn(error);
    console.error("Error fetching köşk courses:", error);
    return [];
  }
};

export const getPendingEnrollments = async (
  koskId: string
): Promise<PendingEnrollmentResponse[]> => {
  try {
    const { courses } = await tedrisatApi();
    return await courses.getPendingEnrollments({ koskId });
  } catch (error) {
    // The shell's read: see `OnRefused`.
    await passOnSignIn(error, "fail");
    console.error("Error fetching pending enrollments:", error);
    return [];
  }
};

/**
 * A course's roster for its team (MDRS-105). Null when tedrisat refused or
 * could not answer — a caller who is not on the course team gets 403.
 */
export const getCourseEnrollments = async (
  courseId: string
): Promise<RosterEnrollmentResponse[] | null> => {
  try {
    const { courses } = await tedrisatApi();
    return await courses.getCourseEnrollments({ id: courseId });
  } catch (error) {
    await passOnSignIn(error);
    console.error("Error fetching course enrollments:", error);
    return null;
  }
};

/**
 * The talebe a course's team took out, with the reasons (MDRS-178). Empty when
 * tedrisat could not answer: the tab then shows no one rather than failing the
 * page the rest of which was read.
 */
export const getRemovedEnrollments = async (
  courseId: string
): Promise<RemovedEnrollmentResponse[]> => {
  try {
    const { courses } = await tedrisatApi();
    return await courses.getRemovedEnrollments({ id: courseId });
  } catch (error) {
    await passOnSignIn(error);
    console.error("Error fetching the removed enrollments:", error);
    return [];
  }
};

/** The signed-in caller with their roles (MDRS-104); null on failure. */
export const getMe = async (): Promise<MeResponse | null> => {
  try {
    const { me } = await tedrisatApi();
    return await me.getMe();
  } catch (error) {
    await passOnSignIn(error);
    console.error("Error fetching the current user:", error);
    return null;
  }
};
