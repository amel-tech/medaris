"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog } from "@medaris/ui/mds/dialog";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";

export interface EnrollmentReceivedDialogProps {
  open: boolean;
  onClose: () => void;
  courseTitle: string;
}

/**
 * Design tedris/07 (B6): the information window after an application that
 * waits for approval went through. The course's name sits over the title, in
 * capitals of the page's language (`i` becomes `İ` in Turkish, which is why the
 * locale is passed), and focus opens on "Tamam" (canvas rule 13).
 */
export function EnrollmentReceivedDialog({
  open,
  onClose,
  courseTitle,
}: EnrollmentReceivedDialogProps) {
  const t = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const okRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      eyebrow={upperCaseFor(courseTitle, locale)}
      title={t("receivedTitle")}
      closeLabel={t("receivedClose")}
      initialFocus={okRef}
      footer={
        <Button ref={okRef} onClick={onClose}>
          {t("receivedOk")}
        </Button>
      }
    >
      <p className="mds-body">{t("receivedBody")}</p>
      <p className="mds-body mt-3">{t("receivedNote")}</p>
    </Dialog>
  );
}

/** Capitals in the language's own rules: tr turns `i` into `İ`, which `toUpperCase()` would not. */
export const upperCaseFor = (text: string, locale: string): string =>
  text.toLocaleUpperCase(locale);
