import { redirect } from "next/navigation";

/** Derslerim moved to `/my-courses` (MDRS-159); the old address still lands there. */
export default async function MyCourses() {
  redirect(`/my-courses`);
}
