"use client";

import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { Button } from "../mds/button";
import { Checkbox } from "../mds/checkbox";
import { PasswordField, PasswordRules } from "./password-field";
import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  evaluatePasswordRules,
  passwordProblems,
} from "./password-rules";
import type { PasswordFieldSpec } from "./register-form";
import { useFocusFirstInvalid, usePageShowReset } from "./use-form-state";

export interface UpdatePasswordFormProps {
  action: string;
  requiredNote: ReactNode;
  password: PasswordFieldSpec;
  passwordConfirm: PasswordFieldSpec;
  passwordMinLength?: number;
  /** the account's e-mail and user name, when the provider tells them */
  email?: string;
  username?: string;
  ruleLabels: {
    length: ReactNode;
    notEmail: ReactNode;
    notUsername: ReactNode;
    met: string;
  };
  errors: {
    required: ReactNode;
    passwordTooShort: ReactNode;
    passwordRules: ReactNode;
    passwordMismatch: ReactNode;
  };
  /** "Diğer cihazlarda çıkış yap", ticked from the start */
  signOutOthers: {
    name: string;
    value: string;
    label: ReactNode;
    description: ReactNode;
  };
  submitLabel: ReactNode;
  submittingLabel: string;
  /** a second submit that leaves the form, when the provider started it from an app */
  cancel?: { name: string; value: string; label: ReactNode };
}

type Errors = { password?: ReactNode; confirm?: ReactNode };

/**
 * The new-password form (canvas medaris/07), the page an e-mailed link opens.
 * The same two fields, the same live rules and the same checks as the
 * registration form; the rules are not a gate on the button (it stays enabled
 * and the reason is written under the field on submit).
 */
export function UpdatePasswordForm({
  action,
  requiredNote,
  password,
  passwordConfirm,
  passwordMinLength = DEFAULT_PASSWORD_MIN_LENGTH,
  email,
  username,
  ruleLabels,
  errors: messages,
  signOutOthers,
  submitLabel,
  submittingLabel,
  cancel,
}: UpdatePasswordFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const rulesId = `${useId().replace(/[^\w-]/g, "")}-rules`;
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checked, setChecked] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  usePageShowReset(() => setBusy(false));
  useFocusFirstInvalid(form, checked);

  // Without an address to compare against the e-mail rule cannot be measured:
  // listing it would tick it for every password, so it is left off and the
  // server (realm policy `notEmail`) stays the only judge.
  const emailKnown = email !== undefined && email.trim() !== "";
  const rules = evaluatePasswordRules({
    password: value,
    email,
    username,
    minLength: passwordMinLength,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    const problems = passwordProblems({
      password: value,
      confirm,
      email,
      username,
      minLength: passwordMinLength,
    });
    const found: Errors = {};
    if (problems.password === "empty") found.password = messages.required;
    if (problems.password === "tooShort")
      found.password = messages.passwordTooShort;
    if (problems.password === "rules") found.password = messages.passwordRules;
    if (problems.confirm === "empty") found.confirm = messages.required;
    if (problems.confirm === "mismatch")
      found.confirm = messages.passwordMismatch;
    if (found.password || found.confirm) {
      event.preventDefault();
      setChecked(found);
      return;
    }
    setBusy(true);
  };

  return (
    <form
      id="kc-passwd-update-form"
      ref={form}
      className="flex flex-col gap-5"
      method="post"
      action={action}
      noValidate
      onSubmit={onSubmit}
    >
      <p className="mds-caption">{requiredNote}</p>

      <PasswordField
        id="password-new"
        name={password.name}
        label={password.label}
        showLabel={password.showLabel}
        autoComplete="new-password"
        autoFocus
        value={value}
        onChange={(next) => {
          setValue(next);
          setChecked((current) => ({ ...current, password: undefined }));
        }}
        error={checked.password ?? password.error}
        belowId={rulesId}
        below={
          <PasswordRules
            id={rulesId}
            metLabel={ruleLabels.met}
            rules={[
              { id: "length", label: ruleLabels.length, met: rules.length },
              ...(emailKnown
                ? [
                    {
                      id: "notEmail",
                      label: ruleLabels.notEmail,
                      met: rules.notEmail,
                    },
                  ]
                : []),
              {
                id: "notUsername",
                label: ruleLabels.notUsername,
                met: rules.notUsername,
              },
            ]}
          />
        }
      />

      <PasswordField
        id="password-confirm"
        name={passwordConfirm.name}
        label={passwordConfirm.label}
        showLabel={passwordConfirm.showLabel}
        autoComplete="new-password"
        value={confirm}
        onChange={(next) => {
          setConfirm(next);
          setChecked((current) => ({ ...current, confirm: undefined }));
        }}
        error={checked.confirm ?? passwordConfirm.error}
      />

      <Checkbox
        name={signOutOthers.name}
        value={signOutOthers.value}
        defaultChecked
        label={signOutOthers.label}
        description={signOutOthers.description}
      />

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="large"
          fullWidth
          loading={busy}
          loadingLabel={submittingLabel}
        >
          {submitLabel}
        </Button>
        {cancel ? (
          <Button
            type="submit"
            size="large"
            variant="ghost"
            fullWidth
            name={cancel.name}
            value={cancel.value}
            formNoValidate
          >
            {cancel.label}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
