import { redirect } from "next/navigation";
import { isSignedIn } from "~/features/courses/public-reads";

// A visitor and a signed-in caller start in different places.
export const dynamic = "force-dynamic";

/**
 * `/` has no page of its own: a signed-in caller starts at Ana sayfa (design
 * tedris/01, `/home`), a visitor at Keşfet, since everything on Ana sayfa is
 * personal (MDRS-165, MDRS-256).
 */
export default async function Root({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/${(await isSignedIn()) ? "home" : "discover"}`);
}
