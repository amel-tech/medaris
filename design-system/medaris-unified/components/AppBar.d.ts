import * as React from 'react';

export interface AppBarProps {
  /** the page's name, one line; an author-written title is isolated with dir="auto" */
  title: string;
  /** a <Logo size="sm" /> passed by the caller; drawn in the bar and at the top of the sheet */
  logo?: React.ReactNode;
  /** the menu button's accessible name; default "Menü" */
  menuLabel?: string;
  /** the name of the sheet and of its <nav>; default "Ana menü" */
  navLabel?: string;
  /** the sheet's close button; default "Kapat" */
  closeLabel?: string;
  /** the NavItems, rendered in the sheet inside .mds-nav--light */
  children: React.ReactNode;
  /** at most two icon buttons at inline-end, e.g. notifications */
  actions?: React.ReactNode;
  /** the sheet's foot: the signed-in person as an a.mds-nav-user link to the settings page, where "Çıkış yap" lives */
  footer?: React.ReactNode;
  className?: string;
}
export declare function AppBar(props: AppBarProps): JSX.Element;
