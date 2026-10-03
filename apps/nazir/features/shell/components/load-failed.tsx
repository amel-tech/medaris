"use client";

import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A read the page cannot do without failed: the retry state (nazir 02,
 * criterion 5). It is never worded as "no access" — the person may well have
 * a scope, the portal just could not see it. Retrying asks the server again.
 */
export function LoadFailed({
  title,
  text,
  retry,
  shell = false,
}: {
  title: string;
  text: string;
  retry: string;
  /** inside the app shell, which owns `<main>` */
  shell?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <SystemState
      kind="error"
      shell={shell}
      title={title}
      action={
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {retry}
        </Button>
      }
    >
      {text}
    </SystemState>
  );
}
