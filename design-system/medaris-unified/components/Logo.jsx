import React from 'react';

// The filter id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `l${++seq}`)[0]);

// The subtitle an app gets when the caller passes none. The landing page has none.
const appNames = { tedris: 'Tedris', nizam: 'Nizam', nazir: 'Nazır', giris: 'Giriş' };

export function Logo({ app, size = 'md', wordmark = false, subtitle = appNames[app], inverse = false, className = '', ...rest }) {
  const filter = `mds-logo-${useUid().replace(/[^\w-]/g, '')}`;
  const cls = ['mds-logo', size !== 'md' && `mds-logo--${size}`, inverse && 'mds-logo--inverse', className].filter(Boolean).join(' ');
  return (
    <span className={cls} role="img" aria-label={subtitle ? `Medaris — ${subtitle}` : 'Medaris'} {...rest}>
      {/* libs/icons MadrasahLogoIcon, as assets/logo-mark.svg: never redraw it */}
      <svg className="mds-logo__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect className="mds-logo__ground" width="48" height="48" rx="12" />
        <g className="mds-logo__arch" filter={`url(#${filter})`}>
          <path d="M14.4327 24.2434V38.1C14.4327 38.9284 15.1042 39.6 15.9327 39.6H23.7173V8.4C15.0737 9.68201 14.9368 16.815 16.0327 20.4C14.0326 21.2 14.4327 23.2 14.4327 24.2434Z" />
          <path d="M33.3172 24.2434V38.1C33.3172 38.9284 32.6456 39.6 31.8172 39.6H24.0325V8.4C32.6762 9.68201 32.8131 16.815 31.7172 20.4C33.7172 21.2 33.3172 23.2 33.3172 24.2434Z" />
        </g>
        <defs>
          <filter id={filter} x="14.4" y="8.4" width="18.9498" height="31.2" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset />
            <feGaussianBlur stdDeviation="0.375" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0" />
            <feBlend mode="normal" in2="shape" result="effect1_innerShadow_1_2" />
          </filter>
        </defs>
      </svg>
      {wordmark && (
        <span className="mds-logo__text">
          <span className="mds-logo__word">Medaris</span>
          {subtitle && <span className="mds-logo__subtitle" dir="auto">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
