import * as React from 'react';

export interface ChoiceChipsProps {
  /** what the chips choose ("İlim", "Ders günleri"); announced even when hidden */
  legend: string;
  name: string;
  /** false: a filter over a list on screen, the legend visually hidden; true: a form field such as "Ders günleri" */
  legendVisible?: boolean;
  options: ChoiceChipsOption[];
  /** checkboxes instead of radios: any number of chips checked */
  multiple?: boolean;
  value?: string | string[];
  defaultValue?: string | string[];
  onChange?: ChoiceChipsChangeHandler;
  className?: string;
}
export interface ChoiceChipsOption {
  value: string;
  label: React.ReactNode;
  /** a decorative glyph before the label, passed as <Icon size="sm" /> */
  icon?: React.ReactNode;
  disabled?: boolean;
}
export type ChoiceChipsChangeHandler = (value: string | string[], event: React.ChangeEvent<HTMLInputElement>) => void;
export declare function ChoiceChips(props: ChoiceChipsProps): JSX.Element;
