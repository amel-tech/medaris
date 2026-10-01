import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "./cx";

export type CheckboxProps = {
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** a settings row: a bordered card around the one choice */
  bordered?: boolean;
  /** goes to the label */
  className?: string;
} & Omit<
  ComponentProps<typeof BaseCheckbox.Root>,
  "children" | "render" | "className"
>;

/**
 * A Base UI checkbox (`.mds-check`, no Indicator: the tick is drawn by `::after`,
 * canvas rule 8) inside its own `<label class="mds-choice">`, which is the 24px
 * hit area. The control is named by the label text alone; the description is
 * wired with `aria-describedby`.
 */
export function Checkbox({
  label,
  description,
  icon,
  bordered = false,
  className,
  ...rest
}: CheckboxProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI's Root renders the control, a hidden input, inside this label
    <label
      className={cx(
        "mds-choice",
        bordered && "mds-choice--bordered",
        className
      )}
    >
      <BaseCheckbox.Root
        {...rest}
        className="mds-check"
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
      />
      {icon ? (
        <span className="mds-choice__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
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
