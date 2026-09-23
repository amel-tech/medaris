import * as React from 'react';

export interface Tab { value: string; label: React.ReactNode }

export interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}
export declare function Tabs(props: TabsProps): JSX.Element;
