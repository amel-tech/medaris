import { redirectToTedris } from "~/lib/tedris";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params;
  return redirectToTedris(path.map(encodeURIComponent).join("/"));
}
