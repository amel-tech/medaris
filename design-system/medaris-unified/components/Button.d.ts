import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ControlSize = 'mini' | 'small' | 'regular' | 'large';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: React.ReactNode;
  /** Required — an icon-only control has no accessible name without it. */
  label: string;
  variant?: ButtonVariant;
  size?: ControlSize;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
