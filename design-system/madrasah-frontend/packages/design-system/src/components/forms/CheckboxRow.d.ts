import type { CSSProperties, ReactNode } from "react";

export interface CheckboxRowProps {
  /** @default false */
  checked?: boolean;
  /** Leading <Icon /> beside the title. */
  icon?: ReactNode;
  title: string;
  /** One or two sentences explaining what the setting does. */
  description?: string;
  onChange?: () => void;
  style?: CSSProperties;
}

/** Bordered checkbox setting row — the Nizam pattern for course/köşk options. */
export declare function CheckboxRow(props: CheckboxRowProps): JSX.Element;
