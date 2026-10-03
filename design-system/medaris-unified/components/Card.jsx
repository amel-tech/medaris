import React from 'react';

/* .mds-card. A clickable card is one link, in its title (href): the link's ::after covers the card,
   so it is one tab stop and the buttons inside it still work. */
export function Card({
  title, action, headingLevel = 3, media, footer, href, density = 'regular',
  children, className = '', ...rest
}) {
  const Heading = `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 3}`;
  const interactive = Boolean(href && title);
  const cls = ['mds-card', interactive && 'mds-card--interactive', className].filter(Boolean).join(' ');
  return (
    <div className={cls} data-density={density === 'compact' ? 'compact' : undefined} {...rest}>
      {media && <div className="mds-card__media">{media}</div>}
      {(title || action) && (
        <div className="mds-card__header">
          {title && (
            <Heading className="mds-card__title" dir="auto">
              {interactive ? <a className="mds-card__link" href={href}>{title}</a> : title}
            </Heading>
          )}
          {action}
        </div>
      )}
      {children}
      {footer && <div className="mds-card__footer">{footer}</div>}
    </div>
  );
}
