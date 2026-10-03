import * as React from 'react';

export interface StatProps {
  label: React.ReactNode;
  /** a number is formatted with Intl in the page's locale: 12.480 */
  value: React.ReactNode;
  /** colours the number, and only when there is a cue. @default "neutral" */
  tone?: 'neutral' | 'success' | 'error';
  /** printed before the number: an icon (check, warning) or a delta label ("+12 bu hafta"); required whenever tone is not neutral */
  cue?: React.ReactNode;
  /** the number's locale; default the nearest lang attribute, else tr-TR */
  locale?: string;
  /** a Progress or a caption, if the number needs context */
  children?: React.ReactNode;
  className?: string;
}
export declare function Stat(props: StatProps): JSX.Element;
