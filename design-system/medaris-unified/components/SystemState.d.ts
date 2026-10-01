import * as React from 'react';

export interface SystemStateProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** restricted is the device restriction page: no shell and no action, whatever is passed */
  kind: 'not-found' | 'forbidden' | 'error' | 'restricted' | 'no-role';
  /** what happened, as a heading; sentence case */
  title: string;
  /** at most two sentences; for restricted the owner's two sentences verbatim */
  children: React.ReactNode;
  /** at most one way back or forward, only one this viewer can take */
  action?: React.ReactNode;
  /** the lg Logo lockup, passed by the caller when there is no app chrome */
  logo?: React.ReactNode;
  /** inside the app shell, which owns the main landmark: renders a section instead */
  shell?: boolean;
  /** the heading element; default 1, the page's title */
  headingLevel?: 1 | 2 | 3;
  className?: string;
}
export declare function SystemState(props: SystemStateProps): JSX.Element;
