"use client";

import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { Button } from "../mds/button";
import { PasswordField, PasswordRules } from "./password-field";
import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  evaluatePasswordRules,
  passwordProblems,
} from "./password-rules";
import {
  isChoice,
  isEmptyValue,
  type ProfileFieldSpec,
  ProfileFields,
  type ProfileFieldValue,
} from "./profile-field";
import { useFocusFirstInvalid, usePageShowReset } from "./use-form-state";

export interface PasswordFieldSpec {
  name: string;
  label: ReactNode;
  showLabel: string;
  error?: ReactNode;
}

export interface RegisterFormProps {
  action: string;
  requiredNote: ReactNode;
  /**
   * Every field the provider asks for at registration, in its order: its user
   * profile. The form draws whatever arrives; a new attribute needs no change
   * here.
   */
  fields: ProfileFieldSpec[];
  /**
   * The field the password pair follows: the later of the user name and the
   * e-mail, so the rules that compare with them read after both. Without it,
   * or when no field has that name, the pair follows the last text field.
   */
  passwordAfter?: string;
  /** the fields the password rules compare with */
  emailField?: string;
  usernameField?: string;
  password: PasswordFieldSpec;
  passwordConfirm: PasswordFieldSpec;
  /** the realm's `length` policy */
  passwordMinLength?: number;
  ruleLabels: {
    length: ReactNode;
    notEmail: ReactNode;
    notUsername: ReactNode;
    /** read after a met rule */
    met: string;
  };
  errors: {
    /** a text left empty: "Lütfen bu alanı doldurun." */
    required: ReactNode;
    /** a choice left unanswered: "Bir seçenek seç." */
    requiredChoice: ReactNode;
    /** "Şifre çok kısa. En az 10 karakter kullan." */
    passwordTooShort: ReactNode;
    /** the password equals the e-mail or the user name */
    passwordRules: ReactNode;
    /** "Şifreler eşleşmiyor. Aynı şifreyi yeniden yaz." */
    passwordMismatch: ReactNode;
  };
  submitLabel: ReactNode;
  submittingLabel: string;
  /** hidden inputs, a captcha, the terms box: whatever the provider adds inside the form */
  children?: ReactNode;
}

type Errors = Partial<Record<string, ReactNode>>;

// The password pair's keys in the error map. The provider reserves both
// names, so no profile field can carry them.
const PASSWORD = "password";
const CONFIRM = "password-confirm";

/**
 * The registration form (canvas medaris/03). A native `<form method="post">`
 * whose checks run first in the browser: a required field left empty or
 * unanswered, a value its own check refuses, a password that breaks a rule, a
 * repeat that does not match. Each of those stops the submission and writes
 * its reason under its own field (`.mds-error`, which replaces the help line),
 * then the focus goes to the first of them. What passes is checked again by
 * the provider, and its answer arrives as the `error` of a field; it stays
 * until that field is changed. The fields and their names are the provider's;
 * the form does not know which provider that is (canvas rule 44).
 */
export function RegisterForm({
  action,
  requiredNote,
  fields,
  passwordAfter,
  emailField = "email",
  usernameField = "username",
  password,
  passwordConfirm,
  passwordMinLength = DEFAULT_PASSWORD_MIN_LENGTH,
  ruleLabels,
  errors: messages,
  submitLabel,
  submittingLabel,
  children,
}: RegisterFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const rulesId = `${useId().replace(/[^\w-]/g, "")}-rules`;
  const [values, setValues] = useState<Record<string, ProfileFieldValue>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""]))
  );
  const [secret, setSecret] = useState({ password: "", confirm: "" });
  const [checked, setChecked] = useState<Errors>({});
  // changed since the provider answered: its answer no longer applies
  const [edited, setEdited] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  usePageShowReset(() => setBusy(false));
  useFocusFirstInvalid(form, checked);

  const touch = (name: string) => {
    setChecked((current) => ({ ...current, [name]: undefined }));
    setEdited((current) => new Set(current).add(name));
  };

  const text = (name: string) => {
    const value = values[name];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  };

  const rules = evaluatePasswordRules({
    password: secret.password,
    email: text(emailField),
    username: text(usernameField),
    minLength: passwordMinLength,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    const found: Errors = {};
    for (const field of fields) {
      if (field.kind === "hidden" || field.readOnly) continue;
      const value = values[field.name] ?? "";
      if (isEmptyValue(field, value)) {
        if (field.required) {
          found[field.name] =
            field.requiredError ??
            (isChoice(field) ? messages.requiredChoice : messages.required);
        }
        continue;
      }
      const reason = field.check?.(value);
      if (reason) found[field.name] = reason;
    }
    const problems = passwordProblems({
      password: secret.password,
      confirm: secret.confirm,
      email: text(emailField),
      username: text(usernameField),
      minLength: passwordMinLength,
    });
    if (problems.password === "empty") found[PASSWORD] = messages.required;
    if (problems.password === "tooShort")
      found[PASSWORD] = messages.passwordTooShort;
    if (problems.password === "rules") found[PASSWORD] = messages.passwordRules;
    if (problems.confirm === "empty") found[CONFIRM] = messages.required;
    if (problems.confirm === "mismatch")
      found[CONFIRM] = messages.passwordMismatch;
    if (Object.values(found).some(Boolean)) {
      event.preventDefault();
      setChecked(found);
      return;
    }
    setBusy(true);
  };

  const shown = (name: string, providerError: ReactNode) =>
    checked[name] ?? (edited.has(name) ? undefined : providerError);

  const errors = Object.fromEntries(
    fields.map((f) => [f.name, shown(f.name, f.error)])
  );

  const pairAfter =
    passwordAfter && fields.some((f) => f.name === passwordAfter)
      ? passwordAfter
      : fields.filter((f) => f.kind === "text").at(-1)?.name;

  const passwordPair = (
    <>
      <PasswordField
        id="password"
        name={password.name}
        label={password.label}
        showLabel={password.showLabel}
        autoComplete="new-password"
        value={secret.password}
        onChange={(value) => {
          setSecret((current) => ({ ...current, password: value }));
          touch(PASSWORD);
        }}
        error={shown(PASSWORD, password.error)}
        belowId={rulesId}
        below={
          <PasswordRules
            id={rulesId}
            metLabel={ruleLabels.met}
            rules={[
              { id: "length", label: ruleLabels.length, met: rules.length },
              {
                id: "notEmail",
                label: ruleLabels.notEmail,
                met: rules.notEmail,
              },
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
        value={secret.confirm}
        onChange={(value) => {
          setSecret((current) => ({ ...current, confirm: value }));
          touch(CONFIRM);
        }}
        error={shown(CONFIRM, passwordConfirm.error)}
      />
    </>
  );

  return (
    <form
      id="kc-register-form"
      ref={form}
      className="flex flex-col gap-5"
      method="post"
      action={action}
      noValidate
      onSubmit={onSubmit}
    >
      <p className="mds-caption">{requiredNote}</p>

      <ProfileFields
        fields={fields}
        values={values}
        errors={errors}
        onChange={(name, value) => {
          setValues((current) => ({ ...current, [name]: value }));
          touch(name);
        }}
        after={(spec) => (spec.name === pairAfter ? passwordPair : null)}
      />

      {pairAfter === undefined ? passwordPair : null}

      {children}

      <Button
        type="submit"
        size="large"
        fullWidth
        loading={busy}
        loadingLabel={submittingLabel}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
