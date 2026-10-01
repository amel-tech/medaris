import { Icon } from "@medaris/ui/mds/icon";
import { Logo } from "@medaris/ui/mds/logo";
import Link from "next/link";

/**
 * The landing pages' chrome, as every landing screen of the canvas draws it:
 * below 768 the system's AppBar (mark, the page's name, sign-in), at 768 and
 * up the paper top bar (wordmark, "Giriş yap", "Kayıt ol"). The top bar is not
 * sticky on the landing pages (the canvas sets it static).
 *
 * "Giriş yap" and "Kayıt ol" are plain links to the redirect routes, not
 * <Link>: they leave the landing app.
 */
export function SiteHeader({
  title,
  home = false,
}: {
  /** the page's name in the phone AppBar */
  title: string;
  /** the home page marks its logo link as the current page */
  home?: boolean;
}) {
  const current = home ? ("page" as const) : undefined;
  return (
    <>
      <header className="mds-appbar">
        <Link
          className="inline-flex"
          href="/"
          aria-label="Medaris, ana sayfa"
          aria-current={current}
        >
          <Logo size="sm" />
        </Link>
        <p className="mds-appbar__title" dir="auto">
          {title}
        </p>
        <div className="mds-appbar__actions">
          <a
            className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
            href="/giris"
            aria-label="Giriş yap"
          >
            <Icon name="signIn" />
          </a>
        </div>
      </header>
      <header className="flex block-topbar items-center gap-6 px-gutter bg-neutral-surface border-be border-neutral-subtle max-md:hidden">
        <Link href="/" aria-label="Medaris, ana sayfa" aria-current={current}>
          <Logo wordmark />
        </Link>
        <div className="ms-auto flex items-center gap-2">
          <a className="mds-btn mds-btn--ghost" href="/giris">
            Giriş yap
          </a>
          <a className="mds-btn mds-btn--secondary" href="/kayit">
            Kayıt ol
          </a>
        </div>
      </header>
    </>
  );
}
