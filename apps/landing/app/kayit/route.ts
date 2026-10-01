import { redirectToTedris, registerPath } from "~/lib/tedris";

export const dynamic = "force-dynamic";

export function GET() {
  return redirectToTedris(registerPath);
}
