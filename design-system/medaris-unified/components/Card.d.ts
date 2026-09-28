import * as React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** a course or köşk title is author text: the heading carries dir="auto" */
  title?: React.ReactNode;
  /** sits opposite the title: a badge or a mini ghost button, never a primary one */
  action?: React.ReactNode;
  /** the heading element for the title. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** a full-bleed top slot, normally <CoverPattern /> passed by the caller */
  media?: React.ReactNode;
  /** a hairline-separated meta row at the bottom */
  footer?: React.ReactNode;
  /** the title becomes a link whose ::after covers the card; needs a title */
  href?: string;
  /** compact sets data-density="compact" on the card, which narrows its inset */
  density?: 'regular' | 'compact';
}
export declare function Card(props: CardProps): JSX.Element;
