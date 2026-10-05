import type { AuthOptions } from "next-auth";
import NextAuth from "next-auth";

export interface HandlerResult {
  status: number;
  location?: string;
  body?: unknown;
}

/**
 * Drives NextAuth's own request handler — the code behind `/api/auth/*` — for
 * one GET, through its pages-router entry, which takes plain objects and so
 * needs no Next request scope. What comes back is what the browser would get:
 * a redirect, or the HTML of one of NextAuth's built-in pages.
 */
export async function nextAuthGet(
  options: AuthOptions,
  action: string,
  query: Record<string, string> = {}
): Promise<HandlerResult> {
  const headers: Record<string, unknown> = {};
  const result: HandlerResult = { status: 200 };
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    setHeader(key: string, value: unknown) {
      headers[key.toLowerCase()] = value;
      if (key.toLowerCase() === "location") result.location = String(value);
      return res;
    },
    getHeader: (key: string) => headers[key.toLowerCase()],
    end() {},
    send(body: unknown) {
      result.body = body;
    },
    json(body: unknown) {
      result.body = body;
    },
  };

  // NextAuth writes `secret` onto the options it is given; hand it a copy.
  // Called with (req, res), its default export is the pages-router handler.
  const handler = NextAuth({ ...options }) as unknown as (
    req: unknown,
    res: unknown
  ) => Promise<void>;
  await handler(
    {
      method: "GET",
      query: { nextauth: [action], ...query },
      headers: { host: "localhost" },
      cookies: {},
    },
    res
  );
  return result;
}
