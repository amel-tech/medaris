import React from 'react';

const tones = ['sky', 'blue', 'green', 'slate'];

/** The tone a seed hashes to: FNV-1a 32-bit over its UTF-8 bytes, mod 4. Lone surrogates count
 *  as U+FFFD, as TextEncoder encodes them, so every platform gets the same tone. */
export function coverTone(seed = '') {
  let h = 2166136261;
  for (const ch of String(seed)) {
    let c = ch.codePointAt(0);
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    const bytes = c < 0x80 ? [c]
      : c < 0x800 ? [0xc0 | (c >> 6), 0x80 | (c & 63)]
      : c < 0x10000 ? [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)]
      : [0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
    for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  }
  return tones[(h >>> 0) % 4];
}

export function CoverPattern({ tone, seed, size = 'md', label, className = '', ...rest }) {
  const t = tones.includes(tone) ? tone : seed != null && seed !== '' ? coverTone(seed) : 'slate';
  const cls = ['mds-cover', `mds-cover--${t}`, size !== 'md' && `mds-cover--${size}`, className].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {label && <p className="mds-eyebrow mds-cover__label" dir="auto">{label}</p>}
    </div>
  );
}
