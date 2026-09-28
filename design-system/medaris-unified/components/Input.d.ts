import * as React from 'react';
import { ControlSize } from './Button';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize;
  error?: boolean;
}
export declare function Input(props: InputProps): JSX.Element;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}
export declare function Textarea(props: TextareaProps): JSX.Element;

export interface FieldProps {
  label?: React.ReactNode;
  help?: React.ReactNode;
  /** Present means the field is in error; the string is shown in place of `help`. */
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}
export declare function Field(props: FieldProps): JSX.Element;
