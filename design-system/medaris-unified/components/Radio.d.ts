import * as React from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  /** one neutral sentence under the label, read as the radio's description */
  description?: React.ReactNode;
  /** a decorative mark before the label: a glyph, or a CoverPattern swatch (size "xs") */
  icon?: React.ReactNode;
  /** a settings row: a hairline border, 16px padding, a lapis edge when checked */
  bordered?: boolean;
  /* native attributes the examples use, redeclared so the adherence rules accept them */
  name?: string;
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: RadioChangeHandler;
}
export type RadioChangeHandler = React.ChangeEventHandler<HTMLInputElement>;
export declare function Radio(props: RadioProps): JSX.Element;
