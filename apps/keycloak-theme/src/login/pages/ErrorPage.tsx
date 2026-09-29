import { Button } from "@medaris/ui/components/button";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { secondaryButtonClassName } from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `error.ftl` — named ErrorPage so it does not shadow the global `Error`.
 * Placeholder layout until MDRS-127's design.
 */
export default function ErrorPage(
  props: ExtendedPageProps<Extract<KcContext, { pageId: "error.ftl" }>, I18n>
) {
  const { kcContext, i18n, Template, classes } = props;

  const { message, client, skipLink } = kcContext;

  const { msg } = i18n;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={false}
      headerNode={msg("errorTitle")}
    >
      <div id="kc-error-message" className="flex flex-col gap-6">
        <p
          className="text-center text-gray-700"
          dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }}
        />
        {!skipLink && !!client?.baseUrl && (
          <Button
            asChild
            variant="outline"
            className={secondaryButtonClassName}
          >
            <a id="backToApplication" href={client.baseUrl}>
              {msg("backToApplication")}
            </a>
          </Button>
        )}
      </div>
    </Template>
  );
}
