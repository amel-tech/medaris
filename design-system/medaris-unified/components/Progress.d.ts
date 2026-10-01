import * as React from 'react';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100, clamped */
  value?: number;
  /** required: the bar's visible name, which also labels the progressbar */
  label: React.ReactNode;
  /** prints the percent at inline-end, Intl in the page's locale: %72 (tr) */
  showValue?: boolean;
  /** follows the percent at 100, with a check: "%100 tamamlandı". @default "tamamlandı" */
  completeLabel?: string;
  /** the percent's locale; default the nearest lang attribute, else tr-TR */
  locale?: string;
}
export declare function Progress(props: ProgressProps): JSX.Element;
