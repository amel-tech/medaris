import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMyCourses } from "~/features/courses/actions";
import { getAccessToken } from "~/lib/auth_options";
import {
  hasWelcomed,
  resolvePostSignInPath,
  WELCOMED_COOKIE,
} from "~/lib/post-sign-in";
import { subjectOf } from "~/lib/token-subject";

/**
 * Where every sign-in that names no page ends (MDRS-101): the first-login
 * screen B1 for a new user, `/learning` for everyone else. Renders nothing.
 */
export default async function StartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const welcomed = hasWelcomed(
    (await cookies()).get(WELCOMED_COOKIE)?.value,
    subjectOf(await getAccessToken())
  );
  // Only asked when the cookie is missing: a returning user on a new device.
  const enrolledCourses = welcomed ? 0 : (await getMyCourses()).length;

  redirect(resolvePostSignInPath({ locale, welcomed, enrolledCourses }));
}
