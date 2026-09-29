import * as React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 24 · 32 · 40 (32 in a compact region) · 48 px */
  size?: 'mini' | 'small' | 'regular' | 'large';
  /** sets aria-invalid="true"; inside Field, the field's error sets it */
  error?: boolean;
  /** Atkinson Hyperlegible Mono and dir="ltr": meeting links, IDs, handles */
  mono?: boolean;
  /** a decorative glyph at inline-start (a search icon); aria-hidden */
  leading?: React.ReactNode;
  /** a unit ("dk") or a glyph at inline-end; aria-hidden, so a unit is also in the label */
  trailing?: React.ReactNode;
  /* native attributes the examples use, redeclared so the adherence rules accept them */
  type?: React.HTMLInputTypeAttribute;
  id?: string;
  name?: string;
  placeholder?: string;
  value?: string | number;
  defaultValue?: string | number;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  onChange?: InputChangeHandler;
}
export type InputChangeHandler = React.ChangeEventHandler<HTMLInputElement>;
export declare function Input(props: InputProps): JSX.Element;
