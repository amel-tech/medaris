import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/*
 * The shell components of canvas note 29 table 3: `.ekran-kabuk`, `-yan`, `-ust`,
 * `-ana` and `-alt` become libs/ui components. Their looks are Tailwind
 * utilities for the place (rule 33): the tokens' roles are `block-topbar`,
 * `inline-sidebar` and the `max-md` break; the look of the content stays in
 * the `.mds-*` layer.
 */

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  /** the `Sidebar`; below 768 it hides and the `AppBar` replaces it */
  sidebar: ReactNode;
  /** the `AppBar`, drawn below 768 only */
  appBar?: ReactNode;
  /** `compact` is the yönetim apps' (nizam, nazır) `data-density` on the `<main>` */
  density?: "compact";
}

/** Nizam and nazar: a sidebar column and the `<main>`. Yönetim apps set `data-density="compact"` on the main. */
export function AppShell({
  sidebar,
  appBar,
  density,
  children,
  className,
  ...rest
}: AppShellProps) {
  return (
    <div
      className={cx(
        "grid min-block-screen grid-cols-[var(--layout-sidebar)_minmax(0,1fr)] max-md:auto-rows-min max-md:grid-cols-1",
        className
      )}
      {...rest}
    >
      {sidebar}
      <div className="flex min-inline-0 flex-col">
        {appBar}
        <main
          id="main"
          data-density={density}
          className="flex min-inline-0 grow flex-col gap-6 pbs-8 pbe-12 px-8 max-md:gap-5 max-md:pbs-5 max-md:pbe-10 max-md:px-gutter"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** the `Logo` */
  brand: ReactNode;
  /** the scope picker, above the nav and outside it */
  scope?: ReactNode;
  /** the signed-in person as `a.mds-nav-user` */
  footer?: ReactNode;
  /** small controls at the inline-end of the brand's row (the theme toggle) */
  tools?: ReactNode;
  navLabel?: string;
}

/** The desktop sidebar: brand (and its tools), scope, a named `<nav>` (none while it has no items), and the account at the block-end. Hidden below 768. */
export function Sidebar({
  brand,
  scope,
  footer,
  tools,
  navLabel = "Ana menü",
  children,
  className,
  ...rest
}: SidebarProps) {
  return (
    <aside
      className={cx(
        "flex flex-col gap-[2px] pbs-5 pbe-3 px-3 bg-neutral-surface border-e border-neutral-subtle max-md:hidden",
        className
      )}
      {...rest}
    >
      {tools ? (
        <div className="flex items-center justify-between gap-2 pbs-1 pbe-5 px-2">
          {brand}
          {tools}
        </div>
      ) : (
        <div className="pbs-1 pbe-5 px-2">{brand}</div>
      )}
      {scope}
      {children ? (
        <nav aria-label={navLabel} className="flex flex-col gap-[2px]">
          {children}
        </nav>
      ) : null}
      {footer ? <div className="mbs-auto pbs-4">{footer}</div> : null}
    </aside>
  );
}

export interface TopBarProps extends HTMLAttributes<HTMLElement> {
  /** the `Logo` */
  brand: ReactNode;
  /** the end side: search, bell, account */
  end?: ReactNode;
}

/** Tedris's sticky top bar; below 768 the `AppBar` replaces it. */
export function TopBar({
  brand,
  end,
  children,
  className,
  ...rest
}: TopBarProps) {
  return (
    <header
      className={cx(
        "sticky inset-bs-0 z-2 flex block-topbar items-center gap-6 px-gutter bg-neutral-surface border-be border-neutral-subtle max-md:hidden",
        className
      )}
      {...rest}
    >
      {brand}
      {children}
      {end ? (
        <div className="ms-auto flex items-center gap-2">{end}</div>
      ) : null}
    </header>
  );
}
