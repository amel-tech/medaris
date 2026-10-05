import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PortalUnavailable } from "~/features/shell/components/portal-layout";
import { getPortal } from "~/features/shell/reads";
import { landingPath, SCOPE_COOKIE } from "~/features/shell/scope";

/**
 * Where a signed-in person lands: the scope they were last in, else their
 * first medrese, else their first course, else the no-access page. Nothing is
 * drawn here; when the roles cannot be read the answer is the retry state, not
 * a guess.
 */
export default async function Home() {
  const portal = await getPortal();
  if (portal.status === "unavailable") return <PortalUnavailable />;
  redirect(
    landingPath(portal.scopes, (await cookies()).get(SCOPE_COOKIE)?.value)
  );
}
