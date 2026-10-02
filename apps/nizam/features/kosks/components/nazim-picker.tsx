"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { lookupUserByEmail } from "../../madrasahs/actions";
import {
  isEmailLike,
  type LookupState,
  type PickedUser,
} from "../../madrasahs/present";
import { addNazim } from "../admin-present";

interface Props {
  /** the accounts chosen so far */
  value: PickedUser[];
  onChange: (users: PickedUser[]) => void;
  disabled?: boolean;
  /** shown under the field while nobody is chosen and the form was sent */
  error?: string;
}

/**
 * The "Köşk nazımı" field (nizam 10 and 21): an exact e-mail address is looked
 * up in the realm's directory and the account found is added to the chosen
 * list, which may hold several. The search runs on Enter or when the field is
 * left, never per key: every search is written to the audit log. Choosing the
 * same person again adds nobody. Each chosen account is a row with a remove
 * button, and the live region says who was chosen.
 */
export function NazimPicker({ value, onChange, disabled, error }: Props) {
  const t = useTranslations("nizam.KoskNazimPicker");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<LookupState | { kind: "already" }>({
    kind: "idle",
  });
  const [announce, setAnnounce] = useState("");
  const searched = useRef<string | null>(null);
  const titleId = useId();

  const search = async () => {
    const wanted = email.trim();
    if (!isEmailLike(wanted) || searched.current === wanted) return;
    searched.current = wanted;
    setState({ kind: "searching" });
    const result = await lookupUserByEmail(wanted);
    if (searched.current !== wanted) return;
    if (result.kind === "found") {
      const known = value.some(
        (p) => p.id.toLowerCase() === result.user.id.toLowerCase()
      );
      if (known) {
        // The address is cleared, or leaving the field would search it again.
        setState({ kind: "already" });
        setEmail("");
      } else {
        onChange(addNazim(value, result.user));
        setAnnounce(t("chosen", { name: result.user.name }));
        setState({ kind: "idle" });
        setEmail("");
      }
      searched.current = null;
    } else if (result.kind === "none") {
      setState({ kind: "none", email: wanted });
    } else {
      setState({ kind: "failed" });
      searched.current = null;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // Enter searches; it must not send the form around it.
    event.preventDefault();
    void search();
  };

  const searchProblem =
    state.kind === "none"
      ? t("notFound")
      : state.kind === "failed"
        ? t("failed")
        : state.kind === "already"
          ? t("already")
          : undefined;
  // With nobody chosen the message is the field's own error. Once somebody is
  // chosen the form is valid, and a search that found nothing must not hold
  // it back (Base UI refuses to send a form with an invalid field), so the
  // message stands beside the field instead of in it.
  const fieldError = value.length === 0 ? (searchProblem ?? error) : undefined;
  const sideNote = value.length > 0 ? searchProblem : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("label")} required help={t("help")} error={fieldError}>
        <Input
          type="email"
          name="nazimEmail"
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder={t("placeholder")}
          leading={<Icon name="search" size="sm" />}
          value={email}
          disabled={disabled || state.kind === "searching"}
          aria-busy={state.kind === "searching" || undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            if (
              state.kind === "none" ||
              state.kind === "failed" ||
              state.kind === "already"
            ) {
              setState({ kind: "idle" });
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => void search()}
        />
      </Field>
      {sideNote ? (
        <p className="mds-error" role="alert" data-testid="picker-note">
          {sideNote}
        </p>
      ) : null}
      <output className="mds-visually-hidden">
        {state.kind === "searching" ? t("searching") : announce}
      </output>

      {value.length > 0 ? (
        <section
          aria-labelledby={titleId}
          className="flex flex-col gap-3"
          data-testid="chosen-nazims"
        >
          <h3 id={titleId} className="mds-label">
            {t("chosenTitle")}
          </h3>
          <ul className="flex flex-col gap-3">
            {value.map((person) => (
              <li key={person.id} className="flex items-center gap-3">
                <Avatar name={person.name} decorative />
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi className="font-semibold text-neutral-default">
                    {person.name}
                  </bdi>
                  {person.email && person.email !== person.name ? (
                    <bdi dir="ltr" className="mds-caption font-mono">
                      {person.email}
                    </bdi>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost"
                  aria-label={t("remove", { name: person.name })}
                  disabled={disabled}
                  onClick={() =>
                    onChange(value.filter((p) => p.id !== person.id))
                  }
                >
                  <Icon name="close" size="sm" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
