import * as React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  /** one neutral sentence under the label, read as the checkbox's description */
  description?: React.ReactNode;
  /** a decorative glyph before the label, in bordered settings rows */
  icon?: React.ReactNode;
  /** a settings row with a hairline border (was #95 CheckboxRow) */
  bordered?: boolean;
  /* native attributes the examples use, redeclared so the adherence rules accept them */
  name?: string;
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
  onChange?: CheckboxChangeHandler;
}
export type CheckboxChangeHandler = React.ChangeEventHandler<HTMLInputElement>;
export declare function Checkbox(props: CheckboxProps): JSX.Element;
