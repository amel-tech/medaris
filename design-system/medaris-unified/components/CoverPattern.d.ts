import * as React from 'react';

export interface CoverPatternProps extends React.HTMLAttributes<HTMLDivElement> {
  /** the cloth chosen for the course; without it the seed decides */
  tone?: 'laciverd' | 'bordo' | 'zumrut' | 'murekkep';
  /** the course, köşk or medrese id, hashed to a cloth when tone is absent; neither gives murekkep */
  seed?: string;
  /** xs is 24 × 32, a swatch for a table row with no label and no stamp; sm 84, md 140, lg 220 px tall */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** the science: its Arabic name ("الصرف") or a short Latin word ("Sarf"); not drawn at xs */
  label?: string;
  /** the label's language; default "ar" when the label is in Arabic script, none otherwise */
  labelLang?: string;
  className?: string;
}
export declare function CoverPattern(props: CoverPatternProps): JSX.Element;
/** FNV-1a 32-bit over the seed's UTF-8 bytes, mod 4 into laciverd, bordo, zumrut, murekkep */
export declare function coverTone(seed: string): NonNullable<CoverPatternProps['tone']>;
