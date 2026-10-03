"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { ErrorState } from "~/features/errors/system-page";

/**
 * Design tedris/40: a segment threw (the API unreachable, a 5xx, anything not
 * expected). `reset` re-renders the segment, with a refresh so server data is read again. Only the digest goes to the
 * console; the visitor is never shown the error.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Segment error:", error.digest ?? error.message);
  }, [error]);

  const router = useRouter();
  // `reset()` alone re-renders with the payload that failed; a server component
  // that threw has to be asked again, so the route is refreshed with it.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return <ErrorState reset={retry} />;
}
