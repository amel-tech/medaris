import type { CSSProperties, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "style"> {
  /** Monospace + 13.5px — for URLs and IDs (e.g. a meeting link). @default false */
  mono?: boolean;
  /** Red border for validation errors. @default false */
  invalid?: boolean;
  style?: CSSProperties;
}

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "style"> {
  /** @default 3 */
  rows?: number;
  style?: CSSProperties;
}

/** Single-line text control. */
export declare function Input(props: InputProps): JSX.Element;
/** Multi-line text control — vertical resize only. */
export declare function Textarea(props: TextareaProps): JSX.Element;
/** Shared control box styles, for building a custom control that must match. */
export declare const controlStyle: CSSProperties;
