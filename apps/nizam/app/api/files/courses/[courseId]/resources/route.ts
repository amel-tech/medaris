import {
  isUuid,
  MAX_FILE_BYTES,
  proxyUpload,
} from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * "Dosya yükle" on the curriculum's "Bağlı kaynaklar" (MDRS-287): the file
 * goes on to tedrisat's `POST /courses/:id/resources/files` as it arrives,
 * with the caller's token added here; tedrisat checks `course.edit`, the size
 * and the type, and its answer (the new row and the course's version, or a
 * refusal) comes back as it is. The route stays inside `proxy.ts`'s matcher
 * so the session is renewed; `next.config.js` lets the proxy carry 25 MB.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  if (!isUuid(courseId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyUpload(request, {
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/resources/files`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_FILE_BYTES,
  });
}
