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

interface Props {
  value: PickedUser | null;
  onChange: (user: PickedUser | null) => void;
  disabled?: boolean;
  /** shown when the form was sent without one */
  error?: string;
}

/**
 * The "Medaris nazımı" field of nizam/12's appointment: an exact e-mail
 * address is looked up in the realm's directory and the account found is
 * chosen. The same search as the başmüderris picker (nizam/08): on Enter or
 * when the field is left, never per key, because every search is written to
 * the audit log.
 */
export function NazimPicker({ value, onChange, disabled, error }: Props) {
  const t = useTranslations("nizam.NazimPicker");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "idle" });
  const searched = useRef<string | null>(null);
  const noteId = useId();

  const search = async () => {
    const wanted = email.trim();
    if (!isEmailLike(wanted) || searched.current === wanted) return;
    searched.current = wanted;
    setState({ kind: "searching" });
    const result = await lookupUserByEmail(wanted);
    if (searched.current !== wanted) return;
    if (result.kind === "found") {
      setState({ kind: "found", user: result.user });
      onChange(result.user);
      setEmail("");
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

  const remove = () => {
    onChange(null);
    setState({ kind: "idle" });
    searched.current = null;
  };

  const problem =
    error ??
    (state.kind === "none"
      ? t("notFound")
      : state.kind === "failed"
        ? t("failed")
        : undefined);

  return (
    <div className="flex flex-col gap-4">
      {value ? null : (
        <Field label={t("label")} required help={t("help")} error={problem}>
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
              if (state.kind === "none" || state.kind === "failed") {
                setState({ kind: "idle" });
              }
            }}
            onKeyDown={onKeyDown}
            onBlur={() => void search()}
          />
        </Field>
      )}
      <output className="mds-visually-hidden">
        {state.kind === "searching" ? t("searching") : ""}
      </output>

      {value ? (
        <section
          aria-labelledby={`${noteId}-title`}
          className="flex flex-col gap-3"
          data-testid="chosen-nazim"
        >
          <h3 id={`${noteId}-title`} className="mds-label">
            {t("chosenTitle")}
          </h3>
          <div className="flex items-center gap-3">
            <Avatar name={value.name} size="lg" decorative />
            <span className="flex min-w-0 flex-1 flex-col">
              <bdi className="font-semibold text-neutral-default">
                {value.name}
              </bdi>
              {value.email && value.email !== value.name ? (
                <bdi dir="ltr" className="mds-caption font-mono">
                  {value.email}
                </bdi>
              ) : null}
              <output className="mds-visually-hidden">
                {t("chosen", { name: value.name })}
              </output>
            </span>
            <button
              type="button"
              className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost"
              aria-label={t("remove", { name: value.name })}
              disabled={disabled}
              onClick={remove}
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
