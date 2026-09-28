import * as React from 'react';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  /** a name from assets/icons.svg; tools/design-system/icons.mjs writes this line */
  name: 'search' | 'bell' | 'globe' | 'home' | 'book' | 'table' | 'sidebar' | 'users' | 'calendar' | 'clock' | 'headset' | 'pdf' | 'doc' | 'quiz' | 'playCircle' | 'check' | 'close' | 'plus' | 'trash' | 'eye' | 'link' | 'download' | 'upload' | 'share' | 'chat' | 'filter' | 'settings' | 'certificate' | 'shield' | 'lock' | 'bookmark' | 'chevronDown' | 'chevronRight' | 'chevronLeft' | 'chevronsUpDown' | 'arrowRight' | 'arrowLeft' | 'more' | 'star' | 'play' | 'signOut' | 'signIn' | 'spinner' | 'edit' | 'copy' | 'cards' | 'student' | 'info' | 'warning' | 'chart' | 'medal' | 'group' | 'mail' | 'language' | 'mosque' | 'verified' | 'devices' | 'graduation' | 'leaf' | 'user' | 'eyeOff' | 'fileDownload' | 'fileCsv' | 'fileXls' | 'shieldCheck' | 'userCircle' | 'externalLink' | 'repeat' | 'chevronUp' | 'archive' | 'undo' | 'ban' | 'video' | 'calendarPlus' | 'menu';
  /** 16 / 20 / 24 */
  size?: 'sm' | 'md' | 'lg';
  /** the filled glyph, as a state (a set star, a saved bookmark); only star, play and bookmark have one */
  filled?: boolean;
  /** names a standalone icon (role="img"); without it the icon is hidden from assistive technology */
  label?: string;
  className?: string;
}
export declare function Icon(props: IconProps): JSX.Element | null;
export declare const iconNames: readonly IconProps['name'][];
