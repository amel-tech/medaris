import { Button } from "@medaris/ui/components/button";
import { Checkbox } from "@medaris/ui/components/checkbox";
import { Input } from "@medaris/ui/components/input";
import { Label } from "@medaris/ui/components/label";
import { cn } from "@medaris/ui/lib/utils";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { FieldContainer } from "../components/FieldContainer";
import { PasswordWrapper } from "../components/PasswordWrapper";
import {
  fieldDir,
  fieldErrorClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `login-update-password.ftl` — second half of password reset (the page the
 * e-mailed link opens), and the "Update Password" required action.
 * Placeholder layout until MDRS-127's design.
 */
export default function LoginUpdatePassword(
  props: ExtendedPageProps<
    Extract<KcContext, { pageId: "login-update-password.ftl" }>,
    I18n
  >
) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;

  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });

  const { msg, msgStr } = i18n;

  const { url, messagesPerField, isAppInitiatedAction } = kcContext;

  const hasError = messagesPerField.existsError("password", "password-confirm");

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={!hasError}
      headerNode={msg("updatePasswordTitle")}
    >
      <form
        id="kc-passwd-update-form"
        action={url.loginAction}
        method="post"
        className="flex flex-col gap-5"
      >
        {(
          [
            ["password-new", "passwordNew", "password"],
            ["password-confirm", "passwordConfirm", "password-confirm"],
          ] as const
        ).map(([inputId, labelKey, errorField]) => (
          <FieldContainer key={inputId} className="max-w-none">
            <Label htmlFor={inputId} className="text-gray-600">
              {msg(labelKey)}
            </Label>
            <PasswordWrapper
              kcClsx={kcClsx}
              i18n={i18n}
              passwordInputId={inputId}
            >
              <Input
                type="password"
                id={inputId}
                name={inputId}
                dir={fieldDir(inputId)}
                autoFocus={inputId === "password-new"}
                autoComplete="new-password"
                aria-invalid={hasError}
                className={cn("w-full pr-10", hasError && fieldErrorClassName)}
              />
            </PasswordWrapper>
            {messagesPerField.existsError(errorField) && (
              <span
                id={`input-error-${errorField}`}
                className="text-error-secondary"
                aria-live="polite"
                dangerouslySetInnerHTML={{
                  __html: kcSanitize(messagesPerField.get(errorField)),
                }}
              />
            )}
          </FieldContainer>
        ))}
        <div className="flex flex-row items-center gap-2">
          {/* Checked by default, as in Keycloak's own page: after a reset
              the old sessions — possibly someone else's — should end. */}
          <Checkbox
            id="logout-sessions"
            name="logout-sessions"
            value="on"
            defaultChecked
          />
          <Label htmlFor="logout-sessions" className="text-sm">
            {msg("logoutOtherSessions")}
          </Label>
        </div>
        <div id="kc-form-buttons" className="flex flex-col gap-3">
          <Button type="submit" className={primaryButtonClassName}>
            {msgStr("doSubmit")}
          </Button>
          {isAppInitiatedAction && (
            <Button
              type="submit"
              name="cancel-aia"
              value="true"
              variant="outline"
              className={secondaryButtonClassName}
            >
              {msg("doCancel")}
            </Button>
          )}
        </div>
      </form>
    </Template>
  );
}
