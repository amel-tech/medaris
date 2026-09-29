import { Button } from "@medaris/ui/components/button";
import { Input } from "@medaris/ui/components/input";
import { Label } from "@medaris/ui/components/label";
import { cn } from "@medaris/ui/lib/utils";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { FieldContainer } from "../components/FieldContainer";
import {
  fieldDir,
  fieldErrorClassName,
  linkClassName,
  primaryButtonClassName,
} from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `login-reset-password.ftl` — first half of password reset: ask for the
 * username or e-mail, Keycloak sends the link. Placeholder layout until
 * MDRS-127's design.
 */
export default function LoginResetPassword(
  props: ExtendedPageProps<
    Extract<KcContext, { pageId: "login-reset-password.ftl" }>,
    I18n
  >
) {
  const { kcContext, i18n, Template, classes } = props;

  const { url, realm, auth, messagesPerField } = kcContext;

  const { msg, msgStr } = i18n;

  const hasError = messagesPerField.existsError("username");

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={!hasError}
      headerNode={msg("emailForgotTitle")}
      headerSubNode={
        realm.duplicateEmailsAllowed
          ? msg("emailInstructionUsername")
          : msg("emailInstruction")
      }
    >
      <form
        id="kc-reset-password-form"
        action={url.loginAction}
        method="post"
        className="flex flex-col gap-5"
      >
        <FieldContainer className="max-w-none">
          <Label htmlFor="username" className="text-gray-600">
            {!realm.loginWithEmailAllowed
              ? msg("username")
              : !realm.registrationEmailAsUsername
                ? msg("usernameOrEmail")
                : msg("email")}
          </Label>
          <Input
            type="text"
            id="username"
            name="username"
            dir={fieldDir("username")}
            autoFocus
            autoComplete="username"
            defaultValue={auth.attemptedUsername ?? ""}
            aria-invalid={hasError}
            className={cn(hasError && fieldErrorClassName)}
          />
          {hasError && (
            <span
              id="input-error-username"
              className="text-error-secondary"
              aria-live="polite"
              dangerouslySetInnerHTML={{
                __html: kcSanitize(messagesPerField.get("username")),
              }}
            />
          )}
        </FieldContainer>
        <div id="kc-form-buttons" className="flex flex-col gap-4">
          <Button type="submit" className={primaryButtonClassName}>
            {msgStr("doSubmit")}
          </Button>
          <a
            id="kc-back-to-login"
            href={url.loginUrl}
            className={cn(linkClassName, "text-center text-sm")}
          >
            {msg("backToLogin")}
          </a>
        </div>
      </form>
    </Template>
  );
}
