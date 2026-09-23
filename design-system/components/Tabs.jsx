import React from 'react';

export function Tabs({ tabs = [], value, onChange, className = '' }) {
  return (
    <div className={['mds-tabs', className].filter(Boolean).join(' ')} role="tablist">
      {tabs.map(t => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={t.value === value}
          className={['mds-tab', t.value === value && 'is-active'].filter(Boolean).join(' ')}
          onClick={() => onChange && onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
