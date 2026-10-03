"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface Props {
  title: string;
  message: string;
  retry: string;
}

/**
 * The page's own state when its data could not be read at all (the API is
 * down): an error Alert with "Yeniden dene", which reads the page again. The
 * words come from the server page so one component serves every köşk page.
 */
export function LoadFailed({ title, message, retry }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Alert tone="error" title={title}>
      <p>{message}</p>
      <Button
        variant="outline"
        size="small"
        loading={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {retry}
      </Button>
    </Alert>
  );
}
