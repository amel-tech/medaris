import * as React from 'react';

export interface RadioGroupProps {
  /** what is being chosen; always visible */
  legend: string;
  name: string;
  options: RadioGroupOption[];
  value?: string;
  defaultValue?: string;
  onChange?: RadioGroupChangeHandler;
  /** every option as a settings row: a hairline border, a lapis edge when checked */
  bordered?: boolean;
  className?: string;
}
export interface RadioGroupOption {
  value: string;
  label: React.ReactNode;
  /** one neutral sentence under the label */
  description?: React.ReactNode;
  /** a decorative mark before the label: a glyph, or a CoverPattern swatch (size "xs") */
  icon?: React.ReactNode;
  disabled?: boolean;
}
export type RadioGroupChangeHandler = (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
export declare function RadioGroup(props: RadioGroupProps): JSX.Element;
