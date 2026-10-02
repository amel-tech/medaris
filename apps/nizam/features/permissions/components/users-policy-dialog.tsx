"use client";

import type { UsersPolicy } from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Messages } from "../present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** what the answer is for: saving changed permissions, or deleting the group */
  mode: "save" | "delete";
  groupName: string;
  /** people who hold the group; with none there is no question, only the confirmation */
  userCount: number;
  busy?: boolean;
  onConfirm: (policy: UsersPolicy | undefined) => void;
}

/**
 * The question of nizam/13 (_kurallar 11 and 16): an `AlertDialog` with a
 * `RadioGroup`. It is asked only while somebody holds the group, names how
 * many, and has no default answer: the button stays off until one is chosen.
 * "Vazgeç" has the focus and the scrim does not close it. For a group nobody
 * holds, deleting is still confirmed, with no question.
 */
export function UsersPolicyDialog({
  open,
  onOpenChange,
  mode,
  groupName,
  userCount,
  busy,
  onConfirm,
}: Props) {
  const t = useTranslations("nizam.UsersPolicyDialog") as unknown as Messages;
  const [policy, setPolicy] = useState<UsersPolicy | null>(null);

  // Every opening starts with no answer.
  useEffect(() => {
    if (open) setPolicy(null);
  }, [open]);

  const asks = userCount > 0;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      eyebrow={groupName}
      title={
        asks
          ? t("titleUsers", { count: userCount })
          : t("titleDelete", { name: groupName })
      }
      confirmLabel={mode === "delete" ? t("confirmDelete") : t("confirmSave")}
      cancelLabel={t("cancel")}
      closeLabel={t("close")}
      confirmDisabled={asks && policy === null}
      confirmLoading={busy}
      onConfirm={() => onConfirm(asks ? (policy ?? undefined) : undefined)}
    >
      {asks ? (
        <RadioGroup
          legend={t(mode === "delete" ? "legendDelete" : "legendSave", {
            count: userCount,
          })}
          value={policy}
          onChange={(v) => setPolicy(v === "keep" ? "keep" : "revoke")}
          bordered
          required
          disabled={busy}
          options={[
            {
              value: "keep",
              label: t("keep"),
              description: t(
                mode === "delete" ? "keepDescDelete" : "keepDescSave"
              ),
            },
            {
              value: "revoke",
              label: t("revoke"),
              description: t(
                mode === "delete" ? "revokeDescDelete" : "revokeDescSave"
              ),
            },
          ]}
        />
      ) : (
        <p>{t("noUsers", { name: groupName })}</p>
      )}
    </AlertDialog>
  );
}
