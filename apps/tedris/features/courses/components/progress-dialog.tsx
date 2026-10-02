"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Dialog } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateCourseProgress } from "../actions";
import { parseProgress } from "../course-view";

/**
 * "İlerlemeni güncelle" (design tedris/12): the talebe writes their own
 * progress, a whole number from 0 to 100. The API refuses anything else, and
 * completing the course is the course team's, so only the number is sent.
 */
export const ProgressDialog = ({
  courseId,
  current,
}: {
  courseId: string;
  current: number;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const progress = parseProgress(value);
    if (progress === null) {
      setError(t("progressInvalid"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateCourseProgress(courseId, progress);
      if (res.success === false) {
        toast.error(res.error);
        return;
      }
      toast.success(t("progressSaved"));
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant="link"
        onClick={() => {
          setValue(String(current));
          setError(null);
          setOpen(true);
        }}
      >
        {t("updateProgress")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        title={t("updateProgress")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("progressCancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("progressSave")}
            </Button>
          </>
        }
      >
        <Field
          label={t("progressField")}
          help={t("progressHelp")}
          error={error}
        >
          <Input
            autoFocus
            name="progress"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </Dialog>
    </>
  );
};
