import Link from "next/link";
import type { ReactNode } from "react";
import { inviteHrefs } from "~/lib/invite-hrefs";

/**
 * The line a signed-out visitor reads where a signed-in one would see the way
 * to apply (designs tedris/09, 10 and 11): "Bir derse başvurmak için giriş yap
 * ya da kayıt ol." `discover` adds that the pages can be browsed without an
 * account. The two links are rich-text parts of one message, so a translation
 * may put them anywhere in the sentence.
 */
/**
 * The one call this component makes of the page's translator, as a narrow
 * signature: the full `getTranslations("tedris")` type makes the checker
 * expand every key of the app's catalogue for each `t.rich`, which past
 * roughly 700 keys no longer finishes (TS2589, MDRS-164).
 */
export type InviteTranslator = {
  rich: (
    key: "AnonymousInvite.apply" | "AnonymousInvite.discover",
    values: Record<string, (chunks: ReactNode) => ReactNode>
  ) => ReactNode;
};

export const AnonymousInvite = ({
  t,
  locale,
  variant,
  callbackPath,
  className,
}: {
  /** The page's own translator (`getTranslations("tedris")`): the page has it already. */
  t: InviteTranslator;
  locale: string;
  variant: "apply" | "discover";
  /** The path (no locale) the visitor returns to after signing in. */
  callbackPath: string;
  className?: string;
}) => {
  const hrefs = inviteHrefs(locale, callbackPath);
  const links = {
    signIn: (chunks: ReactNode) => (
      <Link href={hrefs.signIn} prefetch={false}>
        {chunks}
      </Link>
    ),
    register: (chunks: ReactNode) => (
      <Link href={hrefs.register} prefetch={false}>
        {chunks}
      </Link>
    ),
  };
  // One literal key per branch: the template `AnonymousInvite.${variant}` made
  // the checker expand every key of the app's catalogue (MDRS-164 grew it past
  // the point where that finishes: TS2589).
  return (
    <p className={className}>
      {variant === "apply"
        ? t.rich("AnonymousInvite.apply", links)
        : t.rich("AnonymousInvite.discover", links)}
    </p>
  );
};
