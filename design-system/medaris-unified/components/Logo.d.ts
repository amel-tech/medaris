import * as React from 'react';

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** the app whose name is the default subtitle; the mark is the same in every app */
  app?: 'tedris' | 'nizam' | 'nazir' | 'landing' | 'giris';
  /** mark 24 / 32 / 48 */
  size?: 'sm' | 'md' | 'lg';
  /** "Medaris" beside the mark, in Cairo bold */
  wordmark?: boolean;
  /** under the wordmark and in the accessible name; defaults to the app's display name */
  subtitle?: string;
  /** on the dark sidebar: the wordmark in --text-white */
  inverse?: boolean;
}
export declare function Logo(props: LogoProps): JSX.Element;
