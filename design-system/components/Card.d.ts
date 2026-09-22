import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  /** Sits opposite the title — a mini ghost button, never a primary one. */
  action?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;

export interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: 'neutral' | 'success' | 'error';
  /** A Progress bar or a caption, if the number needs context. */
  children?: React.ReactNode;
}
export declare function Stat(props: StatProps): JSX.Element;
