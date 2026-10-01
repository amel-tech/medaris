import { cn } from "@medaris/ui/lib/utils";

/**
 * A köşk's cover band, tinted by its `coverHue` — the same gradient the
 * course cards and tedris's köşk cards draw, so the hue a manager picks in
 * the form is the one talebe see.
 */
export const KoskCover = ({
  hue,
  className,
}: {
  hue: number;
  className?: string;
}) => (
  <div
    aria-hidden="true"
    className={cn("w-full", className)}
    style={{
      background: `linear-gradient(135deg, oklch(0.94 0.04 ${hue}) 0%, oklch(0.88 0.07 ${hue}) 100%)`,
    }}
  />
);
