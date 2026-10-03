import { forbidden } from "next/navigation";
import { landingFor } from "~/features/assignments/landing";
import { getMyAssignments } from "~/features/assignments/reads";

// Per caller, behind the sign-in middleware.
export const dynamic = "force-dynamic";

/**
 * The köşk pages are for a nazım or SYSTEM_ADMIN. Anyone else gets the
 * "Bu bölüm için izniniz yok" screen with a 403 (design nizam/06, criterion
 * 1). When the roles cannot be read the page is let through: tedrisat checks
 * every call it makes again.
 */
export default async function KosksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMyAssignments();
  if (me && landingFor(me) !== "nizam") forbidden();
  return children;
}
