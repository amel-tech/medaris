import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** `.mds-nav-section`: the label above a group of NavItems. Sentence case; CSS uppercases it, which needs `lang="tr"` on an ancestor for the dotted İ. */
export function NavSection({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("mds-nav-section", className)} {...rest}>
      {children}
    </div>
  );
}
