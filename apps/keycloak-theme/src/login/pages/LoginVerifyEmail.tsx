import { linkClassName } from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `login-verify-email.ftl` — shown right after "Kayıt ol" when the realm
 * requires a verified e-mail. Placeholder layout until MDRS-127's design.
 */
export default function LoginVerifyEmail(
  props: ExtendedPageProps<
    Extract<KcContext, { pageId: "login-verify-email.ftl" }>,
    I18n
  >
) {
  const { kcContext, i18n, Template, classes } = props;

  const { msg } = i18n;

  const { url, user } = kcContext;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      headerNode={msg("emailVerifyTitle")}
      displayInfo
      infoNode={
        <p id="kc-verify-email-resend" className="text-center text-sm">
          <span className="text-gray-600">
            {msg("emailVerifyInstruction2")}
          </span>{" "}
          <a href={url.loginAction} className={linkClassName}>
            {msg("emailVerifyResend")}
          </a>
        </p>
      }
    >
      <p id="kc-verify-email-instruction" className="text-center text-gray-700">
        {msg("emailVerifyInstruction1", user?.email ?? "")}
      </p>
    </Template>
  );
}
