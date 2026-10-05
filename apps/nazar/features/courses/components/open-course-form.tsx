"use client";

import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useToaster } from "@medaris/ui/mds/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { openCourse } from "../actions";
import {
  blankForm,
  courseErrorKey,
  coursesHref,
  type Locks,
  openProblems,
  openRequest,
  TITLE_MAX,
  TITLE_MIN,
} from "../courses";
import { type TeamAction, teamReducer } from "../team";
import { MuderrisPicker } from "./muderris-picker";

/** A köşk the medrese may open a course in, worded for the choice. */
export interface KoskChoice {
  id: string;
  name: string;
  /** "Arapça dil ilimleri · medresenin burada 1 dersi var" */
  line: string;
}

/**
 * The form of "Medrese dersi aç" (nazir 08): the köşk, the name, the müderris
 * list and, in a card beside them, the two settings of the course. The first
 * köşk is chosen, as the design draws it. The button is never off: a problem is
 * written under its field when "Dersi aç" is pressed and the focus goes to the
 * first, except that an imam left unchosen among several müderrisler is said
 * at once. A policy of the medrese that fixes a setting shows it on and off
 * limits, with the sentence that says whose it is; the API applies the policies
 * whatever is sent. A course that opens is a draft, and the page goes back to
 * the list with a toast.
 */
export function OpenCourseForm({
  madrasahId,
  kosks,
  locks,
  policiesUnknown,
  settingsHref,
}: {
  madrasahId: string;
  kosks: KoskChoice[];
  locks: Locks;
  /** the medrese's policies could not be read: nothing is locked here */
  policiesUnknown: boolean;
  settingsHref: string;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => blankForm(kosks));
  const [attempted, setAttempted] = useState(false);
  const listHref = coursesHref(madrasahId, { kosk: null, status: null });

  // A köşk that left the list (its right was withdrawn) is no choice any more.
  const koskId = kosks.some((kosk) => kosk.id === draft.koskId)
    ? draft.koskId
    : null;
  const form = { ...draft, koskId };
  const problems = openProblems(form);
  const closed = locks.closed || draft.closed;
  const approval = locks.approval || draft.approval;
  const dispatch = (action: TeamAction) =>
    setDraft((current) => ({
      ...current,
      team: teamReducer(current.team, action),
    }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (problems) {
      const field = problems.title
        ? "title"
        : problems.team
          ? "muderris-email"
          : null;
      const element = field
        ? event.currentTarget.elements.namedItem(field)
        : null;
      if (element instanceof HTMLElement) element.focus();
      return;
    }
    if (pending) return;
    startTransition(async () => {
      const result = await openCourse(madrasahId, openRequest(form, locks));
      if (result.success) {
        notify({
          title: t("OpenCourse.opened"),
          description: t("OpenCourse.openedBody", {
            title: result.data.title,
          }),
        });
        router.push(listHref);
        return;
      }
      notify({
        tone: "error",
        title: t("OpenCourse.failedTitle"),
        description: words(courseErrorKey(result.code)),
      });
      if (result.code === "HOSTING_RIGHT_REQUIRED") router.refresh();
    });
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start"
      data-testid="open-course-form"
    >
      <div className="flex min-inline-0 flex-col gap-section">
        <p className="mds-caption">* {t("OpenCourse.required")}</p>
        <div className="flex flex-col gap-2">
          <RadioGroup
            legend={
              <>
                {t("OpenCourse.kosk.legend")}
                <span className="mds-required" aria-hidden="true">
                  *
                </span>
              </>
            }
            name="kosk"
            bordered
            value={koskId}
            onChange={(value) => setDraft({ ...draft, koskId: value })}
            options={kosks.map((kosk) => ({
              value: kosk.id,
              label: <bdi>{kosk.name}</bdi>,
              description: kosk.line ? <bdi>{kosk.line}</bdi> : undefined,
            }))}
          />
          <p className={attempted && problems?.kosk ? "mds-error" : "mds-help"}>
            {attempted && problems?.kosk
              ? t("OpenCourse.kosk.required")
              : t("OpenCourse.kosk.help")}
          </p>
        </div>
        <Field
          label={t("OpenCourse.name")}
          required
          help={t("OpenCourse.nameHelp")}
          error={
            attempted && problems?.title
              ? t(`OpenCourse.nameProblems.${problems.title}`, {
                  min: TITLE_MIN,
                  max: TITLE_MAX,
                })
              : undefined
          }
        >
          <Input
            name="title"
            required
            autoComplete="off"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <MuderrisPicker
          team={draft.team}
          dispatch={dispatch}
          legend={t("OpenCourse.team.legend")}
          required
          help={t("OpenCourse.team.help")}
          error={
            problems?.team === "imam"
              ? t("Team.imamMissing")
              : attempted && problems?.team === "none"
                ? t("OpenCourse.team.none")
                : undefined
          }
          removal="icon"
          keepOne={false}
        />
      </div>

      <section
        aria-labelledby="course-settings-heading"
        className="mds-card flex flex-col gap-section p-card"
      >
        <h2 className="mds-h3" id="course-settings-heading">
          {t("OpenCourse.settingsTitle")}
        </h2>
        <div className="flex flex-col gap-3">
          <Checkbox
            bordered
            icon={<Icon name="lock" size="sm" />}
            label={t("OpenCourse.closed.label")}
            description={t("OpenCourse.closed.help")}
            checked={closed}
            disabled={locks.closed}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, closed: checked })
            }
          />
          <Checkbox
            bordered
            icon={<Icon name="shieldCheck" size="sm" />}
            label={t("OpenCourse.approval.label")}
            description={t("OpenCourse.approval.help")}
            checked={approval}
            disabled={locks.approval}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, approval: checked })
            }
          />
          {locks.closed || locks.approval ? (
            <p className="mds-help" data-testid="policy-lock">
              {locks.closed ? `${t("OpenCourse.lock.closed")} ` : ""}
              {locks.approval ? `${t("OpenCourse.lock.approval")} ` : ""}
              {t("OpenCourse.lock.tail.before")}
              <Link
                href={settingsHref}
                className="underline underline-offset-4"
              >
                {t("Nav.medrese.settings")}
              </Link>
              {t("OpenCourse.lock.tail.after")}
            </p>
          ) : null}
          {policiesUnknown ? (
            <p className="mds-help">{t("OpenCourse.policiesUnknown")}</p>
          ) : null}
        </div>
        <p>{t("OpenCourse.note")}</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" href={listHref}>
            {t("OpenCourse.cancel")}
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingLabel={t("OpenCourse.opening")}
          >
            {t("OpenCourse.submit")}
          </Button>
        </div>
      </section>
    </form>
  );
}
