"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { isoToZonedLocal, isUnfinishedEnd, resolveEnd } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { lookupPerson } from "~/features/nazirs/actions";
import { PermissionSection } from "~/features/nazirs/components/permission-section";
import {
  isEmailLike,
  type PickedPerson,
  permissionLabel,
} from "~/features/nazirs/nazirs";
import type { Messages } from "~/lib/i18n/messages";
import { appointCourseNazir, changeCourseNazir } from "../actions";
import {
  boxState,
  type CourseNazirRow,
  type CourseNazirsContext,
  chosenCodes,
  courseNazirErrorKey,
  listMoved,
  pickProblem,
  unchangedPost,
} from "../course-nazirs";

type Search = "idle" | "searching" | "notEmail" | "none" | "failed";

/**
 * "Ders nazırı ata" and "İzinleri düzenle" (MDRS-270) in one Dialog with a
 * Form, as nizam's köşk dialog has them: `row` null appoints, a row edits its
 * post. Every opening starts from what the post holds now, or from nothing.
 *
 * The person is found by their exact e-mail address, searched on Enter or
 * when the field is left and never per key, since every search is written to
 * the audit log; the viewer and a person who holds a post here already are
 * refused before anything is sent. The boxes are the course catalog: a code
 * the caller may not give is off, unless the post holds it already, since
 * taking a code away is no gift. One who appoints only gets no boxes, and the
 * person starts with no permission. The end is a date and a time on the
 * viewer's clock (a prop: nazar's `useTimeZone()` is always Istanbul), and the
 * post and its permissions end at that moment. The scrim does not close it.
 */
export function CourseNazirDialog({
  open,
  row,
  context,
  onClose,
  onDone,
}: {
  open: boolean;
  /** the post being edited; null appoints a new ders nazırı */
  row: CourseNazirRow | null;
  context: CourseNazirsContext;
  onClose: () => void;
  /** called once the list has changed, for the page to read it again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState<Search>("idle");
  const [picked, setPicked] = useState<PickedPerson | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [end, setEnd] = useState("");
  const [unfinished, setUnfinished] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const searched = useRef<string | null>(null);
  const emailRef = useRef<HTMLElement | null>(null);
  const { timeZone } = context;

  const forget = () => {
    setEmail("");
    setSearch("idle");
    setPicked(null);
    searched.current = null;
  };

  // Every opening starts from what the post holds now, or from nothing.
  useEffect(() => {
    if (!open) return;
    setEmail("");
    setSearch("idle");
    setPicked(null);
    searched.current = null;
    setChosen(row ? [...row.codes] : []);
    setEnd(isoToZonedLocal(row?.ends.iso ?? null, timeZone));
    setUnfinished(false);
    setAttempted(false);
  }, [open, row, timeZone]);

  const find = async (enter: boolean) => {
    const wanted = email.trim();
    if (!isEmailLike(wanted)) {
      if (enter && wanted !== "") setSearch("notEmail");
      return;
    }
    if (searched.current === wanted) return;
    searched.current = wanted;
    setSearch("searching");
    const result = await lookupPerson(wanted);
    if (searched.current !== wanted) return;
    if (result.kind === "found") {
      setPicked(result.person);
      setSearch("idle");
      setEmail("");
      searched.current = null;
    } else if (result.kind === "none") {
      setSearch("none");
    } else {
      setSearch("failed");
      searched.current = null;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // Enter searches; it must not send the dialog's form.
    event.preventDefault();
    void find(true);
  };

  // One who appoints only gives nothing: no boxes, and `[]` is sent.
  const boxes = row !== null || context.grantable.length > 0;
  const held = row?.codes ?? [];
  const pickedProblem = pickProblem(picked, context);
  const ready = row !== null || (picked !== null && pickedProblem === null);
  const sent = boxes ? chosenCodes(context.catalog, chosen) : [];
  const ends = (halfTyped: boolean) =>
    resolveEnd({
      value: end,
      held: row?.ends.iso ?? null,
      timeZone,
      now: new Date(),
      assignmentEnd: null,
      unfinished: halfTyped,
    });
  const endProblem = attempted || unfinished ? ends(unfinished).problem : null;
  const name = row?.name ?? picked?.name ?? "";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;
    setAttempted(true);
    // A half-typed picker reads "" and may never have been left, so it is read again here.
    const halfTyped = isUnfinishedEnd(
      event.currentTarget.elements.namedItem("endsAt")
    );
    setUnfinished(halfTyped);
    const { iso, problem } = ends(halfTyped);
    if (problem) return;
    if (row && unchangedPost(row, { permissions: sent, endsAt: iso })) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = row
        ? await changeCourseNazir(context.courseId, row.id, {
            permissions: sent,
            endsAt: iso,
          })
        : await appointCourseNazir(context.courseId, {
            userId: (picked as PickedPerson).id,
            permissions: sent,
            ...(iso ? { endsAt: iso } : {}),
          });
      if (result.success) {
        notify({
          tone: "success",
          title: t(
            row ? "CourseNazirs.dialog.saved" : "CourseNazirs.dialog.appointed"
          ),
          description: t(
            row
              ? "CourseNazirs.dialog.savedBody"
              : "CourseNazirs.dialog.appointedBody",
            { name }
          ),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t(
          row
            ? "CourseNazirs.dialog.saveFailed"
            : "CourseNazirs.dialog.appointFailed"
        ),
        description: words(courseNazirErrorKey(result.code)),
      });
      if (listMoved(result.code)) {
        onClose();
        onDone();
      }
    });
  };

  const searchProblem =
    search === "notEmail"
      ? t("CourseNazirs.dialog.notEmail")
      : search === "none"
        ? t("CourseNazirs.dialog.notFound")
        : search === "failed"
          ? t("CourseNazirs.dialog.unavailable")
          : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={context.courseTitle}
      title={t(
        row
          ? "CourseNazirs.dialog.titleEdit"
          : "CourseNazirs.dialog.titleAppoint"
      )}
      closeLabel={t("Shell.close")}
      initialFocus={row ? undefined : emailRef}
      footerMeta={
        boxes
          ? sent.length > 0
            ? t("CourseNazirs.dialog.summary", { count: sent.length })
            : t("CourseNazirs.dialog.summaryNone")
          : undefined
      }
      footer={
        <>
          <DialogClose>{t("CourseNazirs.dialog.cancel")}</DialogClose>
          <Button
            type="submit"
            loading={pending}
            loadingLabel={t("CourseNazirs.dialog.saving")}
            disabled={!ready}
          >
            {t("CourseNazirs.dialog.save")}
          </Button>
        </>
      }
    >
      {row ? (
        <div className="flex items-center gap-3" data-testid="course-nazir">
          <Avatar name={row.name} size="lg" decorative />
          <span className="flex min-inline-0 flex-col">
            <bdi className="font-semibold text-neutral-default">{row.name}</bdi>
            {row.email ? (
              <bdi dir="ltr" className="mds-caption break-all font-mono">
                {row.email}
              </bdi>
            ) : null}
            <span className="mds-caption">
              <bdi>
                {t("CourseNazirs.dialog.role")} · {row.appointedLine}
              </bdi>
            </span>
          </span>
        </div>
      ) : picked ? (
        <section
          aria-labelledby="chosen-course-nazir"
          className="flex flex-col gap-3"
          data-testid="chosen-course-nazir"
        >
          <h3 className="mds-label" id="chosen-course-nazir">
            {t("CourseNazirs.dialog.chosenTitle")}
          </h3>
          <div className="flex items-center gap-3">
            <Avatar name={picked.name} size="lg" decorative />
            <span className="flex min-inline-0 flex-1 flex-col">
              <bdi className="font-semibold text-neutral-default">
                {picked.name}
              </bdi>
              {picked.email && picked.email !== picked.name ? (
                <bdi dir="ltr" className="mds-caption break-all font-mono">
                  {picked.email}
                </bdi>
              ) : null}
            </span>
            <Button variant="ghost" size="small" onClick={forget}>
              {t("CourseNazirs.dialog.remove")}
            </Button>
          </div>
          {pickedProblem ? (
            <Alert tone="warning">
              <p>
                {pickedProblem === "self"
                  ? t("CourseNazirs.dialog.self")
                  : t("CourseNazirs.dialog.already", { name: picked.name })}
              </p>
            </Alert>
          ) : (
            <p className="mds-caption">
              {t(
                boxes
                  ? "CourseNazirs.dialog.chosenNote"
                  : "CourseNazirs.dialog.appointOnly"
              )}
            </p>
          )}
        </section>
      ) : (
        <Field
          label={t("CourseNazirs.dialog.searchLabel")}
          required
          help={t("CourseNazirs.dialog.searchHelp")}
          error={searchProblem}
        >
          <Input
            {...({ ref: emailRef } as object)}
            type="email"
            name="email"
            mono
            autoComplete="off"
            spellCheck={false}
            placeholder={t("CourseNazirs.dialog.searchPlaceholder")}
            leading={<Icon name="search" size="sm" />}
            value={email}
            disabled={search === "searching"}
            aria-busy={search === "searching" || undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (search !== "idle" && search !== "searching") {
                setSearch("idle");
              }
            }}
            onKeyDown={onKeyDown}
            onBlur={() => void find(false)}
          />
        </Field>
      )}
      <output className="mds-visually-hidden">
        {search === "searching" ? t("CourseNazirs.dialog.searching") : ""}
      </output>

      {boxes ? (
        <PermissionSection
          title={t("CourseNazirs.dialog.permissions")}
          codes={context.catalog}
          labelOf={(code) => permissionLabel(code, words)}
          ticked={(code) =>
            boxState(code, { grantable: context.grantable, held, chosen })
              .ticked
          }
          disabled={(code) =>
            !boxState(code, { grantable: context.grantable, held, chosen })
              .enabled
          }
          onToggle={(code, on) =>
            setChosen((codes) =>
              on
                ? [...codes.filter((c) => c !== code), code]
                : codes.filter((c) => c !== code)
            )
          }
        >
          <p className="mds-caption">
            {t("CourseNazirs.dialog.permissionsHelp")}
          </p>
        </PermissionSection>
      ) : (
        <p className="mds-caption" data-testid="appoint-only">
          {t("CourseNazirs.dialog.appointOnly")}
        </p>
      )}

      <Field
        label={t("CourseNazirs.dialog.endLabel")}
        help={t("CourseNazirs.dialog.endHelp")}
        error={
          endProblem === "unfinished"
            ? t("CourseNazirs.dialog.endProblems.unfinished")
            : endProblem
              ? t("CourseNazirs.dialog.endProblems.past")
              : undefined
        }
      >
        <Input
          type="datetime-local"
          name="endsAt"
          value={end}
          disabled={pending}
          onChange={(event) => {
            setEnd(event.target.value);
            setUnfinished(isUnfinishedEnd(event.target));
          }}
          onBlur={(event) => setUnfinished(isUnfinishedEnd(event.target))}
        />
      </Field>
      <p className="mds-caption">{t("CourseNazirs.dialog.note")}</p>
    </Dialog>
  );
}

/**
 * "Ders nazırı ata": the button the page draws when the list says the caller
 * may appoint, and its dialog. The list is read again once someone is
 * appointed.
 */
export function AppointCourseNazir({
  context,
}: {
  context: CourseNazirsContext;
}) {
  const t = useTranslations("nazar");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        iconLeft={<Icon name="plus" size="sm" />}
        onClick={() => setOpen(true)}
      >
        {t("CourseNazirs.appoint")}
      </Button>
      <CourseNazirDialog
        open={open}
        row={null}
        context={context}
        onClose={() => setOpen(false)}
        onDone={() => startTransition(() => router.refresh())}
      />
    </>
  );
}
