import React from 'react';

// Labels copied from content/meeting-platforms.json and content/recording-providers.json.
const labels = { 'google-meet': 'Google Meet', zoom: 'Zoom', jitsi: 'Jitsi Meet', youtube: 'YouTube', 'google-drive': 'Google Drive' };

export function PlatformChip({
  platform,
  kind = 'meeting',
  label,
  host,
  detected = false,
  unknownLabel = 'Bilinmeyen platform',
  detectedLabel = ', bağlantıdan algılandı',
  className = '',
  ...rest
}) {
  const meeting = kind === 'meeting';
  const unknown = !labels[platform];
  // an unknown recording host shows the host alone: a talebe reads "unknown" as a warning
  const text = label ?? (unknown ? (meeting ? unknownLabel : null) : labels[platform]);
  const showHost = unknown && host;
  if (!text && !showHost) return null;
  const cls = ['mds-platform-chip', `mds-platform-chip--${platform}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} role={detected ? 'status' : undefined} {...rest}>
      {meeting && <span className="mds-platform-chip__dot" aria-hidden="true" />}
      {text}
      {showHost && <span className="mds-platform-chip__host" dir="ltr">{host}</span>}
      {detected && <span className="mds-visually-hidden">{detectedLabel}</span>}
    </span>
  );
}
