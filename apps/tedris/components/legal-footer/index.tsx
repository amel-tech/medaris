import { privacyNoticeUrl } from "@medaris/utils";
import { getTranslations } from "next-intl/server";
import { env } from "~/env";

/**
 * The footer every page carries (MDRS-102): the privacy notice, published on
 * landing-web, opened in a new tab so the app stays where it was.
 */
export async function LegalFooter() {
  const t = await getTranslations("common.legal");

  return (
    <footer className="mt-auto border-t border-gray-200 py-4 text-sm text-gray-500">
      <div className="mx-auto flex w-full max-w-[80rem] justify-center gap-6 px-4">
        <a
          href={privacyNoticeUrl(env.LANDING_URL)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand-primary hover:underline"
        >
          {t("privacyNotice")}
        </a>
      </div>
    </footer>
  );
}
