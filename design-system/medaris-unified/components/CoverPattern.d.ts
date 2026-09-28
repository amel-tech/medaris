import * as React from 'react';

export interface CoverPatternProps extends React.HTMLAttributes<HTMLDivElement> {
  /** the tone chosen for the course; without it the seed decides */
  tone?: 'sky' | 'blue' | 'green' | 'slate';
  /** the course, köşk or medrese id, hashed to a tone when tone is absent; neither gives slate */
  seed?: string;
  /** 84 / 140 / 220 px tall */
  size?: 'sm' | 'md' | 'lg';
  /** the category, as an eyebrow in the tone's ink ("Sarf") */
  label?: string;
  className?: string;
}
export declare function CoverPattern(props: CoverPatternProps): JSX.Element;
/** FNV-1a 32-bit over the seed's UTF-8 bytes, mod 4 into sky, blue, green, slate */
export declare function coverTone(seed: string): NonNullable<CoverPatternProps['tone']>;
