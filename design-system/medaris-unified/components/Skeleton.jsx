import React from 'react';

/* One .mds-skeleton bar, always hidden from assistive technology. The size is two data variables
   the class layer reads (--mds-skeleton-w, --mds-skeleton-h), each a CSS length string. */
export function Skeleton({ width, height, className = '' }) {
  const vars = {};
  if (width != null) vars['--mds-skeleton-w'] = width;
  if (height != null) vars['--mds-skeleton-h'] = height;
  return <div className={['mds-skeleton', className].filter(Boolean).join(' ')} style={vars} aria-hidden="true" />;
}
