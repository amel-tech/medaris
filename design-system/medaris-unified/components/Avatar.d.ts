import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** the person's or the institution's full name: the initials and the accessible name */
  name?: string;
  src?: string;
  /** 32 / 40 / 56 */
  size?: 'sm' | 'md' | 'lg';
  /** the name is printed beside it: aria-hidden, no role */
  decorative?: boolean;
  /** an institution or object (köşk, medrese, deste): a square tile on --radius-tag in the lâciverd cloth */
  entity?: boolean;
  /** the locale that upper-cases the initials; default the nearest lang attribute, else tr-TR */
  locale?: string;
}
export declare function Avatar(props: AvatarProps): JSX.Element;
export declare function initials(name?: string, locale?: string): string;
