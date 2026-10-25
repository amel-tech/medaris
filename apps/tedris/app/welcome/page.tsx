import { redirect } from "next/navigation";

/**
 * `/welcome` was B1, the first-login placeholder screen (MDRS-101). The owner
 * dropped the step: a sign-in lands on the page it named or on Ana sayfa. The
 * address stays, as a redirect to Ana sayfa (`/`), for an old link.
 */
export default async function WelcomePage() {
  redirect(`/`);
}
