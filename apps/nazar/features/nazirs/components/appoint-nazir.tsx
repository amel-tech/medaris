"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Messages } from "~/lib/i18n/messages";
import { appointNazir, lookupPerson } from "../actions";
import { isEmailLike, nazirErrorKey, type PickedPerson } from "../nazirs";

type Search = "idle" | "searching" | "none" | "failed";

/**
 * "Medrese nazırı ata" (nazir 05): the button and its dialog. The person is
 * found by their exact e-mail address, searched on Enter or when the field is
 * left and never per key, because every search is written to the audit log.
 * The person found is chosen, shown with their name, and appointed with no
 * permission: the roster then carries the "henüz izin almadı" band. The scrim
 * does not close the dialog, so a typed address is not lost to a stray click.
 */
export function AppointNazir({
  madrasahId,
  madrasahName,
  held,
}: {
  madrasahId: string;
  madrasahName: string;
  /** the ids of the people who are nazırs already */
  held: readonly string[];
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState<Search>("idle");
  const [picked, setPicked] = useState<PickedPerson | null>(null);
  const searched = useRef<string | null>(null);
  const emailRef = useRef<HTMLElement | null>(null);

  const reset = () => {
    setEmail("");
    setSearch("idle");
    setPicked(null);
    searched.current = null;
  };

  const find = async () => {
    const wanted = email.trim();
    if (!isEmailLike(wanted) || searched.current === wanted) return;
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
    void find();
  };

  const already = Boolean(picked && held.includes(picked.id.toLowerCase()));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!picked || already || pending) return;
    startTransition(async () => {
      const result = await appointNazir(madrasahId, picked.id);
      if (result.success) {
        notify({
          tone: "success",
          title: t("Appoint.appointed"),
          description: t("Appoint.appointedBody", { name: picked.name }),
        });
        setOpen(false);
        reset();
        router.refresh();
      } else {
        notify({
          tone: "error",
          title: t("Appoint.failedTitle"),
          description: words(nazirErrorKey(result.code)),
        });
      }
    });
  };

  const problem =
    search === "none"
      ? t("Appoint.notFound")
      : search === "failed"
        ? t("Appoint.failed")
        : undefined;

  return (
    <>
      <Button
        iconLeft={<Icon name="plus" size="sm" />}
        onClick={() => setOpen(true)}
      >
        {t("Nazirs.appoint")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) reset();
        }}
        form
        onSubmit={submit}
        eyebrow={madrasahName}
        title={t("Appoint.title")}
        closeLabel={t("Shell.close")}
        initialFocus={emailRef}
        footer={
          <>
            <DialogClose>{t("Appoint.cancel")}</DialogClose>
            <Button
              type="submit"
              loading={pending}
              disabled={!picked || already}
            >
              {t("Appoint.submit")}
            </Button>
          </>
        }
      >
        <p>{t("Appoint.intro")}</p>
        {picked ? (
          <section
            aria-labelledby="chosen-nazir"
            className="flex flex-col gap-3"
            data-testid="chosen-nazir"
          >
            <h3 className="mds-label" id="chosen-nazir">
              {t("Appoint.chosenTitle")}
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
              <button
                type="button"
                className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost"
                aria-label={t("Appoint.remove", { name: picked.name })}
                onClick={reset}
              >
                <Icon name="close" size="sm" />
              </button>
            </div>
            {already ? (
              <Alert tone="warning">
                <p>{t("Appoint.already")}</p>
              </Alert>
            ) : null}
          </section>
        ) : (
          <Field
            label={t("Appoint.label")}
            required
            help={t("Appoint.help")}
            error={problem}
          >
            <Input
              {...({ ref: emailRef } as object)}
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
                if (search === "none" || search === "failed") {
                  setSearch("idle");
                }
              }}
              onKeyDown={onKeyDown}
              onBlur={() => void find()}
            />
          </Field>
        )}
        <output className="mds-visually-hidden">
          {search === "searching" ? t("Appoint.searching") : ""}
        </output>
      </Dialog>
    </>
  );
}
