import type { CSSProperties } from "react";

export interface TabItem {
  id: string;
  label: string;
  /** Count chip beside the label. */
  badge?: number | string;
}

export interface TabsProps {
  items: Array<string | TabItem>;
  /** Active tab id. */
  value?: string;
  onChange?: (id: string) => void;
  /** Active underline color. accent = Tedris blue, green = Nizam sub-tabs, ink = neutral. @default "accent" */
  underline?: "accent" | "green" | "ink";
  /** @default "md" */
  size?: "sm" | "md";
  style?: CSSProperties;
}

/** Underline tab bar. The only tab style in the system — no pill or boxed tabs. */
export declare function Tabs(props: TabsProps): JSX.Element;
