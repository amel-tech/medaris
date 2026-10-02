import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import { inviteHrefs } from "~/lib/invite-hrefs";

/**
 * The line a signed-out visitor reads where a signed-in one would see the way
 * to apply (designs tedris/09, 10 and 11): "Bir derse başvurmak için giriş yap
 * ya da kayıt ol." `discover` adds that the pages can be browsed without an
 * account. The two links are rich-text parts of one message, so a translation
 * may put them anywhere in the sentence.
 */
export const AnonymousInvite = ({
  t,
  locale,
  variant,
  callbackPath,
  className,
}: {
  /** The page's own translator (`getTranslations("tedris")`): the page has it already. */
  t: Awaited<ReturnType<typeof getTranslations>>;
  locale: string;
  variant: "apply" | "discover";
  /** The path (no locale) the visitor returns to after signing in. */
  callbackPath: string;
  className?: string;
}) => {
  const hrefs = inviteHrefs(locale, callbackPath);
  return (
    <p className={className}>
      {t.rich(`AnonymousInvite.${variant}`, {
        signIn: (chunks) => (
          <Link href={hrefs.signIn} prefetch={false}>
            {chunks}
          </Link>
        ),
        register: (chunks) => (
          <Link href={hrefs.register} prefetch={false}>
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
};
