"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  type RefObject,
  useId,
  useRef,
  useState,
} from "react";
import { lookupUserByEmail } from "../../madrasahs/actions";
import { isEmailLike, type LookupState } from "../../madrasahs/present";
import {
  addMember,
  normalizedImam,
  removeMember,
  type TeamState,
} from "../present";

interface Props {
  value: TeamState;
  onChange: (team: TeamState) => void;
  disabled?: boolean;
  /** shown under the list while it is empty and the form was sent */
  error?: string;
  /** the e-mail field, for a dialog's opening focus */
  inputRef?: RefObject<HTMLElement | null>;
  /** which of the two layouts: the field first (nizam/32) or the list first (nizam/33) */
  listFirst?: boolean;
  /** the name of the radio group, so two pickers on a page do not share it */
  name?: string;
}

/**
 * The müderris team of a course (nizam 32 and 33): the people are found by an
 * exact e-mail address in the realm's directory (every search is written to the
 * audit log, so it runs on Enter or when the field is left, not per key) and
 * listed with a radio that marks the imam and a "Çıkar" button. A single
 * müderris is the imam; with several the imam is chosen, and a list with
 * several and no choice cannot be saved (`teamReady`).
 */
export function TeamPicker({
  value,
  onChange,
  disabled,
  error,
  inputRef,
  listFirst = false,
  name = "imam",
}: Props) {
  const t = useTranslations("nizam.CourseTeamPicker");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<LookupState | { kind: "already" }>({
    kind: "idle",
  });
  const [announce, setAnnounce] = useState("");
  const searched = useRef<string | null>(null);
  const listId = useId();
  const imam = normalizedImam(value);

  const search = async () => {
    const wanted = email.trim();
    if (!isEmailLike(wanted) || searched.current === wanted) return;
    searched.current = wanted;
    setState({ kind: "searching" });
    const result = await lookupUserByEmail(wanted);
    if (searched.current !== wanted) return;
    if (result.kind === "found") {
      const known = value.members.some(
        (m) => m.userId.toLowerCase() === result.user.id.toLowerCase()
      );
      if (known) {
        setState({ kind: "already" });
      } else {
        onChange(
          addMember(value, {
            userId: result.user.id,
            name: result.user.name,
            email: result.user.email,
          })
        );
        setAnnounce(t("chosen", { name: result.user.name }));
        setState({ kind: "idle" });
      }
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

  const searchProblem =
    state.kind === "none"
      ? t("notFound")
      : state.kind === "failed"
        ? t("failed")
        : state.kind === "already"
          ? t("already")
          : undefined;

  const searchField = (
    <Field
      label={t("searchLabel")}
      help={t("searchHelp")}
      error={value.members.length === 0 ? searchProblem : undefined}
    >
      <Input
        {...(inputRef ? ({ ref: inputRef } as object) : {})}
        type="email"
        name={`${name}Email`}
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
  );

  const list =
    value.members.length === 0 ? null : (
      <fieldset
        className="flex flex-col gap-3 border-0 p-0"
        aria-describedby={`${listId}-note`}
        data-testid="team-list"
      >
        <legend className="mds-label">{t("listLabel")}</legend>
        <ul className="flex flex-col gap-3">
          {value.members.map((m) => {
            const isImam =
              imam !== null && m.userId.toLowerCase() === imam.toLowerCase();
            return (
              <li key={m.userId} className="flex items-center gap-3">
                <label
                  className={`mds-choice mds-choice--bordered min-w-0 flex-1 ${isImam ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    className="mds-radio"
                    name={name}
                    value={m.userId}
                    checked={isImam}
                    disabled={disabled}
                    onChange={() =>
                      onChange({ ...value, imamUserId: m.userId })
                    }
                    aria-label={t("imamRadio", { name: m.name })}
                  />
                  <Avatar name={m.name} decorative />
                  <span className="mds-choice__text">
                    <span className="mds-choice__label">
                      <bdi>{m.name}</bdi>
                    </span>
                    {m.email && m.email !== m.name ? (
                      <bdi dir="ltr" className="mds-caption font-mono">
                        {m.email}
                      </bdi>
                    ) : null}
                    {isImam ? (
                      <span className="mds-caption font-semibold">
                        {t("imamBadge")}
                      </span>
                    ) : null}
                  </span>
                </label>
                <button
                  type="button"
                  className="mds-btn mds-btn--small mds-btn--ghost"
                  aria-label={t("removeLabel", { name: m.name })}
                  disabled={disabled}
                  onClick={() => onChange(removeMember(value, m.userId))}
                >
                  {t("remove")}
                </button>
              </li>
            );
          })}
        </ul>
        <p id={`${listId}-note`} className="mds-caption">
          {value.members.length === 1 ? t("soleNote") : t("manyNote")}
        </p>
        {value.members.length > 1 && imam === null ? (
          <p className="mds-error" role="alert" data-testid="imam-required">
            {t("imamRequired")}
          </p>
        ) : null}
      </fieldset>
    );

  return (
    <div className="flex flex-col gap-4">
      {listFirst ? null : searchField}
      {listFirst ? null : (
        <>
          {searchProblem && value.members.length > 0 ? (
            <p className="mds-error" role="alert" data-testid="picker-note">
              {searchProblem}
            </p>
          ) : null}
        </>
      )}
      {list}
      {value.members.length === 0 && error ? (
        <p className="mds-error" role="alert" data-testid="team-empty">
          {error}
        </p>
      ) : null}
      {listFirst ? (
        <>
          {searchField}
          {searchProblem && value.members.length > 0 ? (
            <p className="mds-error" role="alert" data-testid="picker-note">
              {searchProblem}
            </p>
          ) : null}
        </>
      ) : null}
      <output className="mds-visually-hidden">
        {state.kind === "searching" ? t("searching") : announce}
      </output>
    </div>
  );
}
