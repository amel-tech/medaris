"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "../mds/button";
import { Checkbox } from "../mds/checkbox";
import { Field } from "../mds/field";
import { Input } from "../mds/input";
import { PasswordField } from "./password-field";
import { usePageShowReset } from "./use-form-state";

export interface LoginFormProps {
  /** where the form posts: `url.loginAction` in Keycloak's case */
  action: string;
  requiredNote: ReactNode;
  /** `username`, `password`: the names the provider expects */
  usernameName?: string;
  passwordName?: string;
  usernameLabel: ReactNode;
  passwordLabel: ReactNode;
  /** the reveal button's name */
  showPasswordLabel: string;
  /** kept across a failed sign-in */
  username?: string;
  /** no user-name field: the provider already knows who is signing in */
  usernameHidden?: boolean;
  /** both fields are invalid; the reason is the page's `Alert` */
  invalid?: boolean;
  forgotPassword?: { href: string; label: ReactNode };
  rememberMe?: { name: string; label: ReactNode; defaultChecked?: boolean };
  submitLabel: ReactNode;
  /** read out while the form is sent */
  submittingLabel: string;
  /** hidden inputs and anything else the provider needs inside the form */
  children?: ReactNode;
}

/**
 * The sign-in form (canvas medaris/01). A native `<form method="post">`: it
 * works without script, and the browser's own `required` check stops an empty
 * submission. While the form is on its way the button reports busy but stays
 * focusable (`aria-disabled`, never `disabled`).
 */
export function LoginForm({
  action,
  requiredNote,
  usernameName = "username",
  passwordName = "password",
  usernameLabel,
  passwordLabel,
  showPasswordLabel,
  username,
  usernameHidden = false,
  invalid = false,
  forgotPassword,
  rememberMe,
  submitLabel,
  submittingLabel,
  children,
}: LoginFormProps) {
  const [busy, setBusy] = useState(false);
  usePageShowReset(() => setBusy(false));
  return (
    <form
      id="kc-form-login"
      className="flex flex-col gap-5"
      method="post"
      action={action}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        setBusy(true);
      }}
    >
      <p className="mds-caption">{requiredNote}</p>

      {usernameHidden ? null : (
        <Field label={usernameLabel} required invalid={invalid}>
          <Input
            id="username"
            name={usernameName}
            type="text"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-required
            defaultValue={username ?? ""}
          />
        </Field>
      )}

      <PasswordField
        id="password"
        name={passwordName}
        label={passwordLabel}
        showLabel={showPasswordLabel}
        invalid={invalid}
      />

      {forgotPassword ? (
        <div>
          <a className="mds-btn mds-btn--link" href={forgotPassword.href}>
            {forgotPassword.label}
          </a>
        </div>
      ) : null}

      {rememberMe ? (
        <Checkbox
          name={rememberMe.name}
          value="on"
          label={rememberMe.label}
          defaultChecked={rememberMe.defaultChecked}
        />
      ) : null}

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
