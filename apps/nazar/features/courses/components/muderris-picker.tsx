"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useId,
  useRef,
  useState,
} from "react";
import { lookupPerson } from "~/features/nazirs/actions";
import { isEmailLike } from "~/features/nazirs/nazirs";
import {
  accountsOf,
  canRemove,
  isFull,
  isImam,
  isListed,
  MAX_MUDERRIS,
  type Member,
  type Team,
  type TeamAction,
} from "../team";

type Search = "idle" | "searching" | "none" | "failed" | "listed" | "full";

/**
 * The müderris list of "Medrese dersi aç" and "Müderrisleri değiştir" (nazir 08
 * and 17): an e-mail search above and the people chosen below. The person is
 * found by their exact address, searched on Enter or when the field is left and
 * never per key, because every search is written to the audit log; the person
 * found is added to the list at once. With several accounts each row is a radio
 * that names the imam; a lone müderris is the imam and has no choice to make.
 * A müderris shown by name alone has no account to change, so its row has no
 * radio and no "Çıkar".
 */
export function MuderrisPicker({
  team,
  dispatch,
  legend,
  required = false,
  help,
  error,
  removal,
  keepOne,
  inputRef,
}: {
  team: Team;
  dispatch: (action: TeamAction) => void;
  /** the list's visible name ("Seçilen müderrisler") */
  legend: string;
  required?: boolean;
  help: string;
  /** replaces the help line */
  error?: string;
  /** "Çıkar" as a cross (nazir 08) or as a word (nazir 17) */
  removal: "icon" | "text";
  /** the last account cannot be taken off a course that exists */
  keepOne: boolean;
  /** the search field, for a dialog's first focus */
  inputRef?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("nazar");
  const legendId = useId();
  const helpId = useId();
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState<Search>("idle");
  const [announced, setAnnounced] = useState("");
  const searched = useRef<string | null>(null);

  const find = async () => {
    const wanted = email.trim();
    if (!isEmailLike(wanted) || searched.current === wanted) return;
    if (isFull(team)) {
      setSearch("full");
      return;
    }
    searched.current = wanted;
    setSearch("searching");
    setAnnounced(t("Team.searching"));
    const result = await lookupPerson(wanted);
    if (searched.current !== wanted) return;
    if (result.kind === "found") {
      const { id, name, email: address } = result.person;
      if (isListed(team, id)) {
        setSearch("listed");
        setAnnounced("");
        return;
      }
      dispatch({
        type: "add",
        member: { userId: id, name, email: address, isImam: false },
      });
      setEmail("");
      setSearch("idle");
      setAnnounced(t("Team.added", { name }));
      searched.current = null;
    } else {
      setSearch(result.kind === "none" ? "none" : "failed");
      setAnnounced("");
      if (result.kind === "unavailable") searched.current = null;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // Enter searches; it must not send the form around the picker.
    event.preventDefault();
    void find();
  };

  const problem =
    search === "none"
      ? t("Team.notFound")
      : search === "failed"
        ? t("Team.failed")
        : search === "listed"
          ? t("Team.listed")
          : search === "full"
            ? t("Team.full", { max: MAX_MUDERRIS })
            : undefined;

  const accounts = accountsOf(team).length;
  const choosing = accounts > 1;

  const person = (member: Member) => (
    <>
      <Avatar name={member.name} decorative />
      <span className="mds-choice__text grow">
        <bdi className="font-semibold text-neutral-default">{member.name}</bdi>
        {member.email ? (
          <bdi dir="ltr" className="mds-caption break-all font-mono">
            {member.email}
          </bdi>
        ) : null}
        {member.userId ? null : (
          <span className="mds-caption">{t("Team.noAccount")}</span>
        )}
      </span>
      {isImam(team, member) ? (
        <Badge variant="secondary">{t("Team.imam")}</Badge>
      ) : null}
    </>
  );

  const row = (member: Member, key: string): ReactNode => {
    const id = member.userId;
    const frame = "mds-choice mds-choice--bordered min-inline-0 grow";
    return (
      <div key={key} className="flex items-center gap-3">
        {id && choosing ? (
          // biome-ignore lint/a11y/noLabelWithoutControl: Base UI's Radio.Root renders the control, a hidden input, inside this label
          <label className={frame}>
            <Radio.Root
              value={id}
              className="mds-radio"
              aria-label={t("Team.imamPick", { name: member.name })}
            />
            {person(member)}
          </label>
        ) : (
          <div className={`${frame} cursor-default`}>{person(member)}</div>
        )}
        {id ? (
          <Button
            variant="ghost"
            size="small"
            className={removal === "icon" ? "mds-icon-btn" : undefined}
            disabled={!canRemove(team, keepOne)}
            aria-label={t("Team.removeLabel", { name: member.name })}
            iconLeft={
              removal === "icon" ? <Icon name="close" size="sm" /> : undefined
            }
            onClick={() => dispatch({ type: "remove", userId: id })}
          >
            {removal === "text" ? t("Team.remove") : null}
          </Button>
        ) : null}
      </div>
    );
  };

  const rows = team.members.map((member, index) =>
    row(member, member.userId ?? `${member.name}:${index}`)
  );

  return (
    <div className="flex flex-col gap-section" data-testid="muderris-picker">
      <Field label={t("Team.label")} help={t("Team.help")} error={problem}>
        <Input
          {...({ ref: inputRef } as object)}
          type="email"
          name="muderris-email"
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder={t("Team.placeholder")}
          leading={<Icon name="search" size="sm" />}
          value={email}
          disabled={search === "searching"}
          aria-busy={search === "searching" || undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            if (search !== "idle" && search !== "searching") setSearch("idle");
          }}
          onKeyDown={onKeyDown}
          onBlur={() => void find()}
        />
      </Field>
      <output className="mds-visually-hidden">{announced}</output>
      <div className="flex flex-col gap-2">
        <p className="mds-label" id={legendId}>
          {legend}
          {required ? (
            <span className="mds-required" aria-hidden="true">
              *
            </span>
          ) : null}
        </p>
        <p className={error ? "mds-error" : "mds-help"} id={helpId}>
          {error ?? help}
        </p>
        {choosing ? (
          <RadioGroup
            value={team.imam}
            onValueChange={(value) =>
              dispatch({ type: "imam", userId: String(value) })
            }
            aria-labelledby={legendId}
            aria-describedby={helpId}
            className="flex flex-col gap-3"
          >
            {rows}
          </RadioGroup>
        ) : (
          <div className="flex flex-col gap-3">{rows}</div>
        )}
      </div>
    </div>
  );
}
