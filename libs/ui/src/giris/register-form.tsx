"use client";

import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { Button } from "../mds/button";
import { Checkbox } from "../mds/checkbox";
import { Field } from "../mds/field";
import { Input } from "../mds/input";
import { PasswordField, PasswordRules } from "./password-field";
import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  evaluatePasswordRules,
  passwordProblems,
} from "./password-rules";
import { useFocusFirstInvalid, usePageShowReset } from "./use-form-state";

export interface TextFieldSpec {
  name: string;
  label: ReactNode;
  defaultValue?: string;
  /** what the provider said was wrong with the last submission */
  error?: ReactNode;
  help?: ReactNode;
}

export interface PasswordFieldSpec {
  name: string;
  label: ReactNode;
  showLabel: string;
  error?: ReactNode;
}

export interface RegisterFormProps {
  action: string;
  requiredNote: ReactNode;
  firstName: TextFieldSpec;
  lastName: TextFieldSpec;
  username: TextFieldSpec;
  email: TextFieldSpec;
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
    /** "Lütfen bu alanı doldurun." */
    required: ReactNode;
    /** "Şifre çok kısa. En az 10 karakter kullan." */
    passwordTooShort: ReactNode;
    /** the password equals the e-mail or the user name */
    passwordRules: ReactNode;
    /** "Şifreler eşleşmiyor. Aynı şifreyi yeniden yaz." */
    passwordMismatch: ReactNode;
    /** "Devam etmek için metni okuduğunu onayla." */
    privacy: ReactNode;
  };
  /** the box that has to be ticked: "Aydınlatma Metni’ni okudum." */
  privacy: {
    name: string;
    /** the box's id, so a label can be found by it */
    id: string;
    value: string;
    label: ReactNode;
    /** the words after a link that opens in a new tab, for a screen reader */
    newTabNote: ReactNode;
    /** the `id` the link's `aria-describedby` points at; the note carries it */
    newTabNoteId: string;
    error?: ReactNode;
    defaultChecked?: boolean;
  };
  submitLabel: ReactNode;
  submittingLabel: string;
  /** hidden inputs, a captcha: whatever the provider adds inside the form */
  children?: ReactNode;
}

type Errors = Partial<Record<string, ReactNode>>;

/**
 * The registration form (canvas medaris/03). A native `<form method="post">`
 * whose checks run first in the browser: a field left empty, a password that
 * breaks a rule, a repeat that does not match, the privacy box left unticked.
 * Each of those stops the submission and writes its reason under its own field
 * (`.mds-error`, which replaces the help line), then the focus goes to the
 * first of them. What passes is checked again by the provider, and its answer
 * arrives as the `error` of a field. The names are the provider's; the form
 * does not know which provider that is (canvas rule 44).
 */
export function RegisterForm({
  action,
  requiredNote,
  firstName,
  lastName,
  username,
  email,
  password,
  passwordConfirm,
  passwordMinLength = DEFAULT_PASSWORD_MIN_LENGTH,
  ruleLabels,
  errors: messages,
  privacy,
  submitLabel,
  submittingLabel,
  children,
}: RegisterFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const rulesId = `${useId().replace(/[^\w-]/g, "")}-rules`;
  const [values, setValues] = useState({
    firstName: firstName.defaultValue ?? "",
    lastName: lastName.defaultValue ?? "",
    username: username.defaultValue ?? "",
    email: email.defaultValue ?? "",
    password: "",
    confirm: "",
  });
  const [accepted, setAccepted] = useState(privacy.defaultChecked ?? false);
  const [checked, setChecked] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  usePageShowReset(() => setBusy(false));
  useFocusFirstInvalid(form, checked);

  const set = (key: keyof typeof values) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setChecked((current) => ({ ...current, [key]: undefined }));
  };

  const rules = evaluatePasswordRules({
    password: values.password,
    email: values.email,
    username: values.username,
    minLength: passwordMinLength,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    const found: Errors = {};
    for (const key of ["firstName", "lastName", "username", "email"] as const) {
      if (values[key].trim() === "") found[key] = messages.required;
    }
    const problems = passwordProblems({
      password: values.password,
      confirm: values.confirm,
      email: values.email,
      username: values.username,
      minLength: passwordMinLength,
    });
    if (problems.password === "empty") found.password = messages.required;
    if (problems.password === "tooShort")
      found.password = messages.passwordTooShort;
    if (problems.password === "rules") found.password = messages.passwordRules;
    if (problems.confirm === "empty") found.confirm = messages.required;
    if (problems.confirm === "mismatch")
      found.confirm = messages.passwordMismatch;
    if (!accepted) found.privacy = messages.privacy;
    if (Object.values(found).some(Boolean)) {
      event.preventDefault();
      setChecked(found);
      return;
    }
    setBusy(true);
  };

  const text = (
    key: "firstName" | "lastName" | "username" | "email",
    spec: TextFieldSpec,
    props: {
      id: string;
      type?: "text" | "email";
      autoComplete: string;
      dir?: "ltr" | "auto";
      latin?: boolean;
    }
  ) => (
    <Field
      label={spec.label}
      required
      help={spec.help}
      error={checked[key] ?? spec.error}
    >
      <Input
        id={props.id}
        name={spec.name}
        type={props.type ?? "text"}
        inputMode={props.type === "email" ? "email" : undefined}
        autoComplete={props.autoComplete}
        autoCapitalize={props.latin ? "none" : undefined}
        spellCheck={props.latin ? false : undefined}
        dir={props.dir ?? "auto"}
        required
        aria-required
        value={values[key]}
        onChange={(event) => set(key)(event.currentTarget.value)}
      />
    </Field>
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

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
        {text("firstName", firstName, {
          id: "firstName",
          autoComplete: "given-name",
        })}
        {text("lastName", lastName, {
          id: "lastName",
          autoComplete: "family-name",
        })}
      </div>

      {text("username", username, {
        id: "username",
        autoComplete: "username",
        dir: "ltr",
        latin: true,
      })}

      {text("email", email, {
        id: "email",
        type: "email",
        autoComplete: "email",
        dir: "ltr",
        latin: true,
      })}

      <PasswordField
        id="password"
        name={password.name}
        label={password.label}
        showLabel={password.showLabel}
        autoComplete="new-password"
        value={values.password}
        onChange={set("password")}
        error={checked.password ?? password.error}
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
        value={values.confirm}
        onChange={set("confirm")}
        error={checked.confirm ?? passwordConfirm.error}
      />

      <Field error={checked.privacy ?? privacy.error}>
        <Checkbox
          id={privacy.id}
          name={privacy.name}
          value={privacy.value}
          checked={accepted}
          onCheckedChange={(next) => {
            setAccepted(next);
            setChecked((current) => ({ ...current, privacy: undefined }));
          }}
          required
          label={
            <>
              {privacy.label}
              <span className="mds-required" aria-hidden="true">
                *
              </span>
            </>
          }
        />
        <span className="mds-visually-hidden" id={privacy.newTabNoteId}>
          {privacy.newTabNote}
        </span>
      </Field>

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
