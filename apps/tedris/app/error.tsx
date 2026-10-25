"use client";

import { useEffect } from "react";
import { ErrorState } from "~/features/errors/system-page";

/**
 * Design tedris/40: a segment threw (the API unreachable, a 5xx, anything not
 * expected). Next's `retry` reads the segment from the server again and
 * re-renders it, which a server component that threw needs. Only the digest
 * goes to the console; the visitor is never shown the error.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Segment error:", error.digest ?? error.message);
  }, [error]);

  return <ErrorState retry={retry} />;
}
