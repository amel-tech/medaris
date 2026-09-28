import * as React from 'react';

export interface PlatformChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** the id the app resolved from the link's host (libs/utils resolveMeetingPlatform); never parsed here */
  platform: 'google-meet' | 'zoom' | 'jitsi' | 'youtube' | 'google-drive' | 'unknown';
  /** meeting: a session link, with the dot; recording: a recording provider, no dot */
  kind?: 'meeting' | 'recording';
  /** default from content/meeting-platforms.json or content/recording-providers.json */
  label?: string;
  /** the link's host, printed dir="ltr" in mono after an unknown label, or alone for an unknown recording */
  host?: string;
  /** the inline link editor's live readout: role="status" and a visually hidden detectedLabel */
  detected?: boolean;
  /** a meeting link on an unknown host; default "Bilinmeyen platform" */
  unknownLabel?: string;
  /** default ", bağlantıdan algılandı" */
  detectedLabel?: string;
  className?: string;
}
export declare function PlatformChip(props: PlatformChipProps): JSX.Element | null;
