import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export interface PillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  /** Selected filter — fills dark. @default false */
  active?: boolean;
  /** Static taxonomy tag (subject labels on a köşk card): smaller, non-interactive. @default false */
  tag?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

/** Filter pill and taxonomy tag. Exactly one pill in a filter row is active. */
export declare function Pill(props: PillProps): JSX.Element;
