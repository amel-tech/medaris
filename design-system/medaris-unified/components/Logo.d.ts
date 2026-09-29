import * as React from 'react';

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** the app whose name is the default subtitle; the mark is the same in every app */
  app?: 'tedris' | 'nizam' | 'nazir' | 'landing' | 'giris';
  /** mark 24 / 32 / 48; sm drops the inner rule; lg with the wordmark adds مدارس under it */
  size?: 'sm' | 'md' | 'lg';
  /** "Medaris" beside the mark, in Literata semibold */
  wordmark?: boolean;
  /** under the wordmark and in the accessible name; defaults to the app's display name, except at lg */
  subtitle?: string;
}
export declare function Logo(props: LogoProps): JSX.Element;
