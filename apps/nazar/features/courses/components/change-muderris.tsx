"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Messages } from "~/lib/i18n/messages";
import { replaceMuderris } from "../actions";
import { type CourseRow, courseErrorKey } from "../courses";
import {
  teamChanged,
  teamOf,
  teamProblem,
  teamReducer,
  teamRequest,
} from "../team";
import { MuderrisPicker } from "./muderris-picker";

/**
 * "Müderrisleri değiştir" (nazir 17): a Dialog with a Form over the course's
 * müderris list. The list starts as the course has it; people are added by
 * their e-mail address and taken off with "Çıkar", and with several accounts
 * the imam is chosen. "Kaydet" stays off until the list differs from where it
 * started and is complete: at least one account, and an imam where there are
 * several, so the reason is written under the list at once. The scrim does not
 * close the dialog. The list is sent whole: the API gives the accounts that
 * leave no role, and leaves a müderris with no account as it is.
 */
export function ChangeMuderris({
  madrasahId,
  course,
  onClose,
  onDone,
}: {
  madrasahId: string;
  /** the course the dialog is open for */
  course: CourseRow;
  onClose: () => void;
  /** called once the list is saved, or the course is gone, for the page to read the list again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [start] = useState(() => teamOf(course.team));
  const [team, dispatch] = useReducer(teamReducer, start);
  const searchRef = useRef<HTMLElement | null>(null);

  const problem = teamProblem(team);
  const ready = problem === null && teamChanged(start, team);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;
    startTransition(async () => {
      const result = await replaceMuderris(
        madrasahId,
        course.id,
        teamRequest(team)
      );
      if (result.success) {
        notify({
          tone: "success",
          title: t("ChangeTeam.saved"),
          description: t("ChangeTeam.savedBody", { title: course.title }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t("ChangeTeam.failedTitle"),
        description: words(courseErrorKey(result.code)),
      });
      if (result.code === "MADRASAH_COURSE_NOT_FOUND") {
        onClose();
        onDone();
      }
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={course.title}
      title={t("ChangeTeam.title")}
      closeLabel={t("Shell.close")}
      initialFocus={searchRef}
      footerMeta={t("ChangeTeam.count", { count: team.members.length })}
      footer={
        <>
          <DialogClose>{t("ChangeTeam.cancel")}</DialogClose>
          <Button
            type="submit"
            loading={pending}
            loadingLabel={t("ChangeTeam.saving")}
            disabled={!ready}
          >
            {t("ChangeTeam.save")}
          </Button>
        </>
      }
    >
      <p>{t("ChangeTeam.intro")}</p>
      <MuderrisPicker
        team={team}
        dispatch={dispatch}
        legend={t("ChangeTeam.legend")}
        required
        help={t("ChangeTeam.help")}
        error={problem === "imam" ? t("Team.imamMissing") : undefined}
        removal="text"
        keepOne
        inputRef={searchRef}
      />
    </Dialog>
  );
}
