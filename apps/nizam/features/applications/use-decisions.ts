"use client";

import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import {
  approveEnrollment,
  rejectEnrollment,
} from "~/features/kosks/actions/courses";
import {
  type ApplicationRow,
  decisionErrorKey,
  type Messages,
  rowKey,
} from "./present";

/**
 * Onayla and Reddet for a waiting application, shared by the köşk's
 * Başvurular page (nizam 31) and a course's Talebeler tab (nizam 57). Only the
 * acting row is busy; a decided row is dropped at once and the server data is
 * refreshed so the sidebar's badge follows. tedrisat decides who may; a
 * refusal comes back as a sentence in a toast that stays (canvas rule 21).
 */
export function useDecisions(koskId: string) {
  const t = useTranslations("nizam.ApplicationsPage") as unknown as Messages;
  const toaster = useToaster();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());

  const decide = useCallback(
    async (row: ApplicationRow, kind: "approve" | "reject") => {
      const key = rowKey(row);
      setBusy(key);
      let result:
        | Awaited<ReturnType<typeof approveEnrollment>>
        | Awaited<ReturnType<typeof rejectEnrollment>>;
      try {
        result =
          kind === "approve"
            ? await approveEnrollment(koskId, row.courseId, row.userId)
            : await rejectEnrollment(koskId, row.courseId, row.userId);
      } catch {
        // the action itself failed (network, server crash): say so, keep the row
        toaster.notify({
          tone: "error",
          title: t("actionFailed"),
          description: t("errorUnknown"),
        });
        return;
      } finally {
        setBusy(null);
      }

      if (!result.success) {
        const errorKey = decisionErrorKey(result.errorBody);
        toaster.notify({
          tone: "error",
          title: t("actionFailed"),
          description: t(errorKey),
        });
        // someone else decided it first: the row is stale, not retryable
        if (errorKey === "errorGone") {
          setDecided((current) => new Set(current).add(key));
          router.refresh();
        }
        return;
      }

      setDecided((current) => new Set(current).add(key));
      const values = { name: row.name, course: row.courseTitle };
      toaster.notify(
        kind === "approve"
          ? {
              title: t("approved"),
              description: t("approvedBody", values),
            }
          : {
              title: t("rejected"),
              description: t("rejectedBody", values),
            }
      );
      router.refresh();
    },
    [koskId, router, t, toaster]
  );

  return { busy, decided, decide };
}
