import type { CSSProperties, ReactNode } from "react";

export interface ToastProps {
  /** @default "success" */
  tone?: "success" | "info" | "danger";
  title: string;
  /** One short sentence of detail. */
  description?: string;
  /** Optional trailing action, e.g. an undo Button. */
  action?: ReactNode;
  /** Absolutely position bottom-right of the nearest positioned ancestor. @default true */
  anchored?: boolean;
  style?: CSSProperties;
}

/** Bottom-right confirmation toast. The container needs position: relative. */
export declare function Toast(props: ToastProps): JSX.Element;
