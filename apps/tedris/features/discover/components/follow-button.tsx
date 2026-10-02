"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { followKosk, unfollowKosk } from "~/features/courses/actions";

export interface FollowLabels {
  follow: string;
  following: string;
  failed: string;
}

/**
 * "Takip et" / "Takip ediliyor" (MDRS-159). The state flips at once and goes
 * back, with a toast, when the API refuses; the button is disabled while the
 * request is out, so a double press is one request. Kept off the card's link
 * by the kit: a button inside an interactive card sits above its overlay.
 */
export function FollowButton({
  koskId,
  koskName,
  following,
  labels,
}: {
  koskId: string;
  koskName: string;
  following: boolean;
  labels: FollowLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(following);

  const toggle = () =>
    startTransition(async () => {
      const next = !shown;
      setShown(next);
      const result = next
        ? await followKosk(koskId)
        : await unfollowKosk(koskId);
      if (result.success === false) {
        toast.error(labels.failed);
        return;
      }
      router.refresh();
    });

  return (
    <Button
      variant="outline"
      size="mini"
      disabled={pending}
      aria-pressed={shown}
      aria-label={`${shown ? labels.following : labels.follow}: ${koskName}`}
      iconLeft={shown ? <Icon name="check" size="sm" /> : undefined}
      onClick={toggle}
    >
      {shown ? labels.following : labels.follow}
    </Button>
  );
}
