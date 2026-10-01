import * as React from 'react';

export interface TooltipProps {
  /** the tooltip text: a short supplement, never the only place the information lives */
  label: string;
  /** the one focusable element it belongs to */
  children: React.ReactElement;
  /** wires aria-describedby on the child; turn it off when the label is already the child's name. @default true */
  describes?: boolean;
  /** @default "top" */
  placement?: 'top' | 'bottom';
  className?: string;
}
export declare function Tooltip(props: TooltipProps): JSX.Element;
