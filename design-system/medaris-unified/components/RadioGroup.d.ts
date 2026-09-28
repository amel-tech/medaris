import * as React from 'react';

export interface RadioGroupProps {
  /** what is being chosen; always visible */
  legend: string;
  name: string;
  options: RadioGroupOption[];
  value?: string;
  defaultValue?: string;
  onChange?: RadioGroupChangeHandler;
  /** every option as a settings row with a hairline border */
  bordered?: boolean;
  className?: string;
}
export interface RadioGroupOption {
  value: string;
  label: React.ReactNode;
  /** one neutral sentence under the label */
  description?: React.ReactNode;
  disabled?: boolean;
}
export type RadioGroupChangeHandler = (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
export declare function RadioGroup(props: RadioGroupProps): JSX.Element;
