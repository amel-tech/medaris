import { Button } from "@medaris/ui/components/button";
import {
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `terms.ftl` — the "Terms and Conditions" required action. The text itself
 * is the `termsText` message; the privacy notice that will fill it is
 * MDRS-102. Placeholder layout until MDRS-127's design.
 */
export default function Terms(
  props: ExtendedPageProps<Extract<KcContext, { pageId: "terms.ftl" }>, I18n>
) {
  const { kcContext, i18n, Template, classes } = props;

  const { msg } = i18n;

  const { url } = kcContext;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={false}
      headerNode={msg("termsTitle")}
    >
      <div
        id="kc-terms-text"
        className="mb-6 max-h-80 overflow-y-auto rounded-lg bg-gray-50 p-4 text-gray-700"
      >
        {msg("termsText")}
      </div>
      <form
        className="flex flex-col gap-3"
        action={url.loginAction}
        method="POST"
      >
        <Button
          id="kc-accept"
          name="accept"
          type="submit"
          className={primaryButtonClassName}
        >
          {msg("doAccept")}
        </Button>
        <Button
          id="kc-decline"
          name="cancel"
          type="submit"
          variant="outline"
          className={secondaryButtonClassName}
        >
          {msg("doDecline")}
        </Button>
      </form>
    </Template>
  );
}
