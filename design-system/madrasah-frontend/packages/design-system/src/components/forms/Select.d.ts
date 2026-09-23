import type { CSSProperties, ChangeEvent } from "react";

export interface SelectProps {
  /** Current value — rendered as text in display mode. */
  value?: string;
  /** Option labels. Required when onChange is provided. */
  options?: string[];
  /** Supply to render a real <select>; omit for the display-only prototype surface. */
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  name?: string;
  id?: string;
  style?: CSSProperties;
}

/** Select control with the system's chevron affordance. */
export declare function Select(props: SelectProps): JSX.Element;
