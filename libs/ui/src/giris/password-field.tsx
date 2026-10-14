"use client";

import { EyeIcon, EyeSlashIcon } from "@medaris/icons";
import { type ReactNode, useState } from "react";
import { Field } from "../mds/field";
import { Icon } from "../mds/icon";
import { IconButton } from "../mds/icon-button";
import { Input } from "../mds/input";

export interface PasswordRuleView {
  id: string;
  label: ReactNode;
  met: boolean;
}

export interface PasswordRulesProps {
  id?: string;
  rules: PasswordRuleView[];
  /** read after a met rule, for the screen reader only: ", karşılandı" */
  metLabel: string;
}

/**
 * The live rule list under a new password (canvas medaris/03): a tick in front
 * of each rule that is met, and the words ", karşılandı" after it for a screen
 * reader. A plain list, set up as one help line.
 *
 * A rule not met yet has a bullet in the tick's place, in the help line's own
 * colour. It used to be a hollow 16px ring in the control-edge colour, which
 * on a form with radios (the registration form's gender) read as one more
 * radio.
 */
export function PasswordRules({ id, rules, metLabel }: PasswordRulesProps) {
  return (
    <ul className="mds-help m-0 flex list-none flex-col gap-1 p-0" id={id}>
      {rules.map((rule) => (
        <li
          key={rule.id}
          className="flex items-center gap-2"
          data-met={rule.met ? "true" : "false"}
        >
          {rule.met ? (
            <Icon name="check" size="sm" />
          ) : (
            <span aria-hidden="true" className="inline-4 shrink-0 text-center">
              •
            </span>
          )}
          {rule.label}
          {rule.met ? (
            <span className="mds-visually-hidden">{metLabel}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface PasswordFieldProps {
  id: string;
  name: string;
  label: ReactNode;
  /** the name of the reveal button; it keeps the same name and toggles `aria-pressed` */
  showLabel: string;
  autoComplete?: "current-password" | "new-password";
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  /** replaces what is under the field */
  error?: ReactNode;
  /** invalid, with the reason shown elsewhere */
  invalid?: boolean;
  /** under the field while there is no error: the rule list */
  below?: ReactNode;
  /** the `id` of `below`, so the input is described by it */
  belowId?: string;
}

/**
 * A password input with a reveal button beside it (canvas medaris/01, 03, 07).
 * The input is always left to right, also on an Arabic page. The button is an
 * outlined `IconButton` that keeps one name and reports its state through
 * `aria-pressed`.
 */
export function PasswordField({
  id,
  name,
  label,
  showLabel,
  autoComplete = "current-password",
  value,
  defaultValue,
  onChange,
  required = true,
  autoFocus,
  error,
  invalid,
  below,
  belowId,
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} required={required} error={error} invalid={invalid}>
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          dir="ltr"
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          aria-required={required || undefined}
          aria-describedby={!error && belowId ? belowId : undefined}
          value={value}
          defaultValue={defaultValue}
          onChange={
            onChange
              ? (event) => onChange(event.currentTarget.value)
              : undefined
          }
          className="flex-1 min-inline-0"
          // An address, a user name, a password: a Latin island (MDS-TYPE-04),
          // so an Arabic page draws it in the UI face and size, as canvas
          // medaris/02 does. Empty: the language of such a string is unknown.
          lang=""
        />
        <IconButton
          variant="outline"
          label={showLabel}
          aria-pressed={shown}
          aria-controls={id}
          onClick={() => setShown((current) => !current)}
          icon={
            shown ? (
              <EyeSlashIcon className="mds-icon" aria-hidden="true" />
            ) : (
              <EyeIcon className="mds-icon" aria-hidden="true" />
            )
          }
        />
      </div>
      {error ? null : below}
    </Field>
  );
}
