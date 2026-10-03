import React from 'react';

/** Initials from a Turkish name: first letter of the first two words. */
export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toLocaleUpperCase('tr-TR');
}

export function Avatar({ name, src, size = 'md', className = '', ...rest }) {
  const cls = ['mds-avatar', size !== 'md' && `mds-avatar--${size}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} title={name} {...rest}>
      {src ? <img src={src} alt={name || ''} /> : initials(name)}
    </span>
  );
}

export function AvatarStack({ people = [], max = 3 }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span style={{ display: 'flex' }}>
      {shown.map((p, i) => (
        <Avatar key={p.name || i} name={p.name} src={p.src} size="sm"
          style={{ marginLeft: i ? -10 : 0, boxShadow: '0 0 0 2px var(--background-white)' }} />
      ))}
      {rest > 0 && (
        <span className="mds-avatar mds-avatar--sm"
          style={{ marginLeft: -10, boxShadow: '0 0 0 2px var(--background-white)', background: 'var(--background-neutral-tertiary)', color: 'var(--text-neutral-tertiary)' }}>
          +{rest}
        </span>
      )}
    </span>
  );
}
