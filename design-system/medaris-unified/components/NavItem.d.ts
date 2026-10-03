import * as React from 'react';

export interface NavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** required: an <a> without href is not a link and takes no focus */
  href: string;
  /** an <Icon size="sm" /> passed by the caller; decorative */
  icon?: React.ReactNode;
  /** the viewer's page: renders aria-current="page" */
  active?: boolean;
  /** an unread or pending count at inline-end, in the page's locale; 0 renders nothing */
  count?: number;
  /** visually hidden text after the count, naming what it counts, e.g. "okunmamış" */
  countLabel?: string;
  /** a glyph at inline-end, e.g. <Icon name="lock" size="sm" label="Kilitli" /> */
  trailing?: React.ReactNode;
  /** the count's locale; default the nearest lang, then tr-TR */
  locale?: string;
}
export declare function NavItem(props: NavItemProps): JSX.Element;
