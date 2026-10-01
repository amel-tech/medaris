import type { HTMLAttributes } from "react";
import { cx } from "./cx";

// Labels from content/meeting-platforms.json and content/recording-providers.json.
const labels: Record<string, string> = {
  "google-meet": "Google Meet",
  zoom: "Zoom",
  jitsi: "Jitsi Meet",
  youtube: "YouTube",
  "google-drive": "Google Drive",
};

export interface PlatformChipProps extends HTMLAttributes<HTMLSpanElement> {
  platform: string;
  kind?: "meeting" | "recording";
  label?: string;
  /** printed beside an unknown platform */
  host?: string;
  /** the platform was read from the pasted link */
  detected?: boolean;
  unknownLabel?: string;
  detectedLabel?: string;
}

/** `.mds-platform-chip`: where a celse meets or where a recording lives. */
export function PlatformChip({
  platform,
  kind = "meeting",
  label,
  host,
  detected = false,
  unknownLabel = "Bilinmeyen platform",
  detectedLabel = ", bağlantıdan algılandı",
  className,
  ...rest
}: PlatformChipProps) {
  const meeting = kind === "meeting";
  const unknown = !labels[platform];
  // An unknown recording host shows the host alone: a talebe reads "unknown" as a warning.
  const text =
    label ?? (unknown ? (meeting ? unknownLabel : null) : labels[platform]);
  const showHost = unknown && host;
  if (!text && !showHost) return null;
  return (
    <span
      className={cx(
        "mds-platform-chip",
        `mds-platform-chip--${platform}`,
        className
      )}
      role={detected ? "status" : undefined}
      {...rest}
    >
      {meeting ? (
        <span className="mds-platform-chip__dot" aria-hidden="true" />
      ) : null}
      {text}
      {showHost ? (
        <span className="mds-platform-chip__host" dir="ltr">
          {host}
        </span>
      ) : null}
      {detected ? (
        <span className="mds-visually-hidden">{detectedLabel}</span>
      ) : null}
    </span>
  );
}
