import React from 'react';

/* Wraps .mds-breadcrumb: where the URL already is, root first. The last item is the
   current page and never a link; below 768 only its parent shows, as a back link.
   With no parent there is nothing to show, so no landmark is rendered. */
export function Breadcrumb({ items = [], label = 'Sayfa yolu', className = '', ...rest }) {
  if (items.length < 2) return null;
  const last = items.length - 1;
  return (
    <nav className={['mds-breadcrumb', className].filter(Boolean).join(' ')} aria-label={label} {...rest}>
      <ol className="mds-breadcrumb__list">
        {items.map((item, i) => {
          const { label: text, href } = typeof item === 'string' ? { label: item } : item;
          let node;
          if (i === last) {
            node = <span className="mds-breadcrumb__current" aria-current="page"><bdi>{text}</bdi></span>;
          } else if (href) {
            node = (
              <a className="mds-breadcrumb__link" href={href}>
                {i === last - 1 && <span className="mds-breadcrumb__back" aria-hidden="true" />}
                <bdi>{text}</bdi>
              </a>
            );
          } else {
            node = <span className="mds-breadcrumb__text"><bdi>{text}</bdi></span>;
          }
          return (
            <li key={i} className="mds-breadcrumb__item">
              {node}
              {i < last && <span className="mds-breadcrumb__sep" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
