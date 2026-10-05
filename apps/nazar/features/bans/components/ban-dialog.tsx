"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useRef,
  useState,
  useTransition,
} from "react";
import { lookupPerson } from "~/features/nazirs/actions";
import { isEmailLike, type PickedPerson } from "~/features/nazirs/nazirs";
import type { Messages } from "~/lib/i18n/messages";
import { banPerson } from "../actions";
import {
  banErrorKey,
  banRequest,
  isBlank,
  MADRASAH_SCOPE,
  REASON_MAX,
} from "../bans";

type Search = "idle" | "searching" | "none" | "failed";

/**
 * The person's e-mail address, searched on Enter or when the field is left and
 * never per key (every search is written to the audit log); an exact match is
 * the person. Finding no one is an answer, a directory that cannot be reached
 * is "şu an yapılamıyor".
 */
function PersonField({
  onPick,
  inputRef,
}: {
  onPick: (person: PickedPerson) => void;
  inputRef: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("nazar");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState<Search>("idle");
  const searched = useRef<string | null>(null);

  const find = async () => {
    const wanted = email.trim();
    if (!isEmailLike(wanted) || searched.current === wanted) return;
    searched.current = wanted;
    setSearch("searching");
    const result = await lookupPerson(wanted);
    if (searched.current !== wanted) return;
    if (result.kind === "found") {
      onPick(result.person);
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
    void find();
  };

  return (
    <>
      <Field
        label={t("BanDialog.personLabel")}
        required
        help={t("Appoint.help")}
        error={
          search === "none"
            ? t("Appoint.notFound")
            : search === "failed"
              ? t("Appoint.failed")
              : undefined
        }
      >
        <Input
          {...({ ref: inputRef } as object)}
          type="email"
          name="email"
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder={t("Appoint.placeholder")}
          leading={<Icon name="search" size="sm" />}
          value={email}
          disabled={search === "searching"}
          aria-busy={search === "searching" || undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            if (search === "none" || search === "failed") setSearch("idle");
          }}
          onKeyDown={onKeyDown}
          onBlur={() => void find()}
        />
      </Field>
      <output className="mds-visually-hidden">
        {search === "searching" ? t("Appoint.searching") : ""}
      </output>
    </>
  );
}

/**
 * "Yasakla" (nazir 10 and 11): bars a talebe from one course of the medrese or
 * from all of them. From Talebeler the person is the row's and the choices are
 * that talebe's courses; from Yasaklamalar nobody is chosen yet, so the dialog
 * asks for their e-mail address first and offers the medrese's courses. The
 * first course is chosen, the narrowest scope, as the Nizam dialog does; the
 * whole medrese is the last choice. The reason is required: the button stays
 * off until there is one, "Bir gerekçe yazın." shows once the field has been
 * left empty, and the scrim does not close the dialog.
 */
export function BanDialog({
  madrasahId,
  madrasahName,
  person,
  courses,
  coursesFailed = false,
  onClose,
  onDone,
}: {
  madrasahId: string;
  madrasahName: string;
  /** the person to bar; null asks for their e-mail address first */
  person: PickedPerson | null;
  courses: ReadonlyArray<{ id: string; title: string }>;
  /** the medrese's courses could not be read: only the whole medrese is offered */
  coursesFailed?: boolean;
  onClose: () => void;
  /** called once the ban is saved, for the page to read its list again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<PickedPerson | null>(person);
  const [scope, setScope] = useState(courses[0]?.id ?? MADRASAH_SCOPE);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const firstRef = useRef<HTMLElement | null>(null);
  const blank = isBlank(reason);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !picked) return;
    if (blank) {
      setTouched(true);
      return;
    }
    const chosen = courses.find((course) => course.id === scope);
    startTransition(async () => {
      const result = await banPerson(
        madrasahId,
        banRequest({ userId: picked.id, scope, reason })
      );
      if (result.success) {
        notify({
          title: t("BanDialog.saved"),
          description: chosen
            ? t("BanDialog.savedCourse", {
                name: picked.name,
                course: chosen.title,
              })
            : t("BanDialog.savedMadrasah", { name: picked.name }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t("BanDialog.failedTitle"),
        description: words(banErrorKey(result.code)),
      });
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
      eyebrow={madrasahName}
      title={t("BanDialog.title")}
      closeLabel={t("Shell.close")}
      initialFocus={firstRef}
      footer={
        <>
          <DialogClose>{t("BanDialog.cancel")}</DialogClose>
          <Button
            type="submit"
            loading={pending}
            disabled={blank || picked === null}
          >
            {t("BanDialog.submit")}
          </Button>
        </>
      }
    >
      <p>{t("BanDialog.intro")}</p>
      <p className="mds-caption">* {t("BanDialog.required")}</p>
      {picked ? (
        <div className="flex items-center gap-3" data-testid="ban-person">
          <Avatar name={picked.name} decorative />
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
          {person === null ? (
            <button
              type="button"
              className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost"
              aria-label={t("Appoint.remove", { name: picked.name })}
              onClick={() => setPicked(null)}
            >
              <Icon name="close" size="sm" />
            </button>
          ) : null}
        </div>
      ) : (
        <PersonField onPick={setPicked} inputRef={firstRef} />
      )}
      <RadioGroup
        legend={t("BanDialog.scopeLegend")}
        name="scope"
        bordered
        value={scope}
        disabled={pending}
        onChange={setScope}
        options={[
          ...courses.map((course) => ({
            value: course.id,
            label: <bdi>{course.title}</bdi>,
            description: t("BanDialog.courseDesc"),
          })),
          {
            value: MADRASAH_SCOPE,
            label: t("BanDialog.madrasah"),
            description: t("BanDialog.madrasahDesc"),
          },
        ]}
      />
      {coursesFailed ? (
        <p className="mds-help">{t("BanDialog.coursesFailed")}</p>
      ) : null}
      <Field
        label={t("BanDialog.reasonLabel")}
        required
        help={t("BanDialog.reasonHelp")}
        error={touched && blank ? t("BanDialog.reasonRequired") : undefined}
      >
        <Textarea
          {...(picked ? ({ ref: firstRef } as object) : {})}
          name="reason"
          value={reason}
          maxLength={REASON_MAX}
          rows={4}
          required
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
        />
      </Field>
    </Dialog>
  );
}

/** The "Yasakla" button in the header of Yasaklamalar and the dialog it opens, which asks who is to be barred. */
export function BanButton({
  madrasahId,
  madrasahName,
  courses,
  coursesFailed,
}: {
  madrasahId: string;
  madrasahName: string;
  courses: ReadonlyArray<{ id: string; title: string }>;
  coursesFailed: boolean;
}) {
  const t = useTranslations("nazar");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        iconLeft={<Icon name="ban" size="sm" />}
        onClick={() => setOpen(true)}
      >
        {t("Bans.ban")}
      </Button>
      {open ? (
        <BanDialog
          madrasahId={madrasahId}
          madrasahName={madrasahName}
          person={null}
          courses={courses}
          coursesFailed={coursesFailed}
          onClose={() => setOpen(false)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
