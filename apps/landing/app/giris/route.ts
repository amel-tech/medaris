import { redirectToTedris, signInPath } from "~/lib/tedris";

export const dynamic = "force-dynamic";

export function GET() {
  return redirectToTedris(signInPath);
}
