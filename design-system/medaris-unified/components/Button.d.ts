import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'mini' | 'small' | 'regular' | 'large';
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** renders <a class="mds-btn">; with disabled, <a role="link" aria-disabled="true"> without href */
  href?: string;
  /** .mds-btn--full: the whole inline size (the sticky enrol card, 390 layouts) */
  fullWidth?: boolean;
  /** busy: aria-disabled and aria-busy, click and Enter/Space ignored, a spinner in place of iconLeft, loadingLabel announced. Pass it from the first render (false) */
  loading?: boolean;
  /** announced in the status region while loading. @default "Yükleniyor" */
  loadingLabel?: string;
  /* native attributes the examples use, redeclared so the adherence rules accept them */
  /** @default "button"; only a form's one action is "submit" */
  type?: 'button' | 'submit' | 'reset';
  /** a footer button's value: a Dialog form closes with it; "cancel" closes any Dialog */
  value?: string;
  disabled?: boolean;
  onClick?: ButtonClickHandler;
}
export type ButtonClickHandler = React.MouseEventHandler<HTMLButtonElement>;
export declare function Button(props: ButtonProps): JSX.Element;
