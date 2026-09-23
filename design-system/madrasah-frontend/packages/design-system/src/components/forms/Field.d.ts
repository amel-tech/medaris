import type { CSSProperties, ReactNode } from "react";

export interface FieldProps {
  /** Label text, sentence case, Turkish. */
  label?: string;
  /** Appends a red asterisk. @default false */
  required?: boolean;
  /** Helper line under the control. One short sentence. */
  hint?: string;
  htmlFor?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

/** Label + control + hint wrapper. Every form control is wrapped in one. */
export declare function Field(props: FieldProps): JSX.Element;
