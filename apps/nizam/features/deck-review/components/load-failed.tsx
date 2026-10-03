"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { useRouter } from "next/navigation";

interface Props {
  title: string;
  body: string;
  retryLabel: string;
}

/**
 * The in-page warning of a deck screen whose first read failed (the server
 * unreachable, a 5xx): what went wrong and "Yeniden dene", which asks the
 * server component for the read again.
 */
export function LoadFailed({ title, body, retryLabel }: Props) {
  const router = useRouter();
  return (
    <Alert tone="error" title={title}>
      <p>{body}</p>
      <Button variant="outline" size="small" onClick={() => router.refresh()}>
        {retryLabel}
      </Button>
    </Alert>
  );
}
