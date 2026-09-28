import * as React from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  /** one neutral sentence under the label, read as the switch's description */
  description?: React.ReactNode;
  /* native attributes the examples use, redeclared so the adherence rules accept them */
  name?: string;
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
  onChange?: SwitchChangeHandler;
}
export type SwitchChangeHandler = React.ChangeEventHandler<HTMLInputElement>;
export declare function Switch(props: SwitchProps): JSX.Element;
