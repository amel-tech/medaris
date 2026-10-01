import * as React from 'react';

export interface AvatarStackProps {
  people: AvatarStackPerson[];
  /** how many avatars are drawn. @default 3 */
  max?: number;
  /** the whole head-count; the last tile shows +N = total − shown. Default people.length */
  total?: number;
  /** names the stack as a group, e.g. "12 talebe"; the +N tile is then hidden from assistive technology */
  label?: string;
  /** the locale for the initials and the count; default the nearest lang attribute, else tr-TR */
  locale?: string;
  className?: string;
}
export interface AvatarStackPerson {
  name?: string;
  src?: string;
}
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;
