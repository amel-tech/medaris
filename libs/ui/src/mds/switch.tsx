import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "./cx";

export type SwitchProps = {
  label: ReactNode;
  description?: ReactNode;
  /** goes to the label */
  className?: string;
} & Omit<
  ComponentProps<typeof BaseSwitch.Root>,
  "children" | "render" | "className"
>;

/**
 * A Base UI switch (`.mds-switch`, no Thumb: the knob is `::after`, canvas rule
 * 7) inside its own `<label class="mds-choice">`. The checked state is announced
 * as on/off by the role, so the component writes no words of its own.
 */
export function Switch({
  label,
  description,
  className,
  ...rest
}: SwitchProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI's Root renders the control, a hidden input, inside this label
    <label className={cx("mds-choice", className)}>
      <BaseSwitch.Root
        {...rest}
        className="mds-switch"
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
      />
      <span className="mds-choice__text">
        <span className="mds-choice__label" id={labelId}>
          {label}
        </span>
        {description ? (
          <span className="mds-choice__desc" id={descId}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
