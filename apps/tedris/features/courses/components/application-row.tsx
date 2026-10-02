"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { leaveCourse } from "../actions";

/**
 * One request in "Başvurularım" (MDRS-159, design tedris/20), with "Başvuruyu
 * geri çek" beside it. Withdrawing deletes the enrollment; the whole row leaves
 * the list at once and comes back, with a toast, if the API refuses. The
 * content is rendered on the server and passed in; only the withdrawal needs
 * the browser.
 */
export function ApplicationRow({
  courseId,
  courseTitle,
  cover,
  status,
  labels,
  children,
}: {
  courseId: string;
  courseTitle: string;
  cover: ReactNode;
  status: ReactNode;
  labels: { withdraw: string; failed: string };
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);

  if (gone) return null;

  const withdraw = () =>
    startTransition(async () => {
      setGone(true);
      const result = await leaveCourse(courseId);
      if (result.success === false) {
        setGone(false);
        toast.error(labels.failed);
        return;
      }
      router.refresh();
    });

  return (
    <li>
      <Card className="flex flex-row flex-wrap items-center gap-4">
        {cover}
        <div className="flex min-inline-0 grow basis-72 flex-col gap-1">
          {children}
        </div>
        <div className="flex flex-none items-center gap-3 max-md:flex-wrap">
          {status}
          <Button
            variant="ghost"
            size="small"
            loading={pending}
            aria-label={`${labels.withdraw}: ${courseTitle}`}
            onClick={withdraw}
          >
            {labels.withdraw}
          </Button>
        </div>
      </Card>
    </li>
  );
}
