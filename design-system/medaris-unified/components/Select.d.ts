import * as React from 'react';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** a plain string is its own value and label */
  options: (string | SelectOption)[];
  /** the hidden first option shown until something is chosen; default "Seçin", "" for none */
  placeholder?: string;
  /** 24 · 32 · 40 (32 in a compact region) · 48 px */
  size?: 'mini' | 'small' | 'regular' | 'large';
  /** sets aria-invalid="true"; inside Field, the field's error sets it */
  error?: boolean;
  /* native attributes the examples use, redeclared so the adherence rules accept them */
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: SelectChangeHandler;
}
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export type SelectChangeHandler = React.ChangeEventHandler<HTMLSelectElement>;
export declare function Select(props: SelectProps): JSX.Element;
