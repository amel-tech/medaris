import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** sets aria-invalid="true"; inside Field, the field's error sets it */
  error?: boolean;
  /* native attributes the examples use, redeclared so the adherence rules accept them */
  id?: string;
  name?: string;
  rows?: number;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  /** "auto" for anything a person writes: it may be Arabic */
  dir?: 'auto' | 'ltr' | 'rtl';
  disabled?: boolean;
  required?: boolean;
  onChange?: TextareaChangeHandler;
}
export type TextareaChangeHandler = React.ChangeEventHandler<HTMLTextAreaElement>;
export declare function Textarea(props: TextareaProps): JSX.Element;
