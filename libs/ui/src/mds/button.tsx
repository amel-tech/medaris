import { Button as BaseButton } from "@base-ui/react/button";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { cx } from "./cx";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link";
export type ButtonSize = "mini" | "small" | "regular" | "large";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  /** busy: aria-disabled and aria-busy, never `disabled`, so focus survives a submit */
  loading?: boolean;
  /** written into the status region while busy */
  loadingLabel?: string;
  disabled?: boolean;
}

export type ButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> & {
    href?: undefined;
  };
export type ButtonLinkProps = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps> & {
    href: string;
  };

/**
 * Wraps `.mds-btn`. Port of design-system/medaris-unified/components/Button.jsx
 * (read its .prompt.md); the behaviour comes from Base UI's Button, the look
 * from the class layer only. A link stays an `<a class="mds-btn">`: Base UI
 * does not render a link as a Button (canvas rule 10).
 */
export function Button(props: ButtonProps | ButtonLinkProps) {
  const {
    children,
    variant = "primary",
    size = "regular",
    iconLeft,
    iconRight,
    fullWidth = false,
    loading,
    loadingLabel = "Yükleniyor",
    disabled,
    className,
    onClick,
    onKeyDown,
    ...rest
  } = props;
  const busy = Boolean(loading);
  const cls = cx(
    "mds-btn",
    `mds-btn--${size}`,
    `mds-btn--${variant}`,
    fullWidth && "mds-btn--full",
    className
  );
  const isLink = props.href !== undefined;
  // A disabled link loses its href, so role="link" keeps it a link; a busy one keeps href and focus.
  const off = isLink && Boolean(disabled) && !busy;
  const blocked = busy || off;

  // pointer-events alone would not stop the keyboard, so a busy submit could fire twice (MDS-A11Y-11).
  const click = (e: MouseEvent<HTMLElement>) => {
    if (blocked) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    (onClick as ((e: MouseEvent<HTMLElement>) => void) | undefined)?.(e);
  };
  const keyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (blocked && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    (onKeyDown as ((e: KeyboardEvent<HTMLElement>) => void) | undefined)?.(e);
  };

  const content = (
    <>
      {busy ? (
        <span className="mds-btn__spinner" aria-hidden="true" />
      ) : (
        iconLeft
      )}
      {children}
      {iconRight}
    </>
  );
  // aria-busy is not announced on a button, so a status region beside it speaks instead. It is
  // rendered whenever the caller drives `loading`, so it is in the page before it has to speak.
  const status = loading !== undefined && (
    <output className="mds-visually-hidden">{busy ? loadingLabel : ""}</output>
  );

  if (isLink) {
    const { href, ...anchor } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <>
        <a
          {...anchor}
          className={cls}
          href={off ? undefined : href}
          role={off ? "link" : anchor.role}
          aria-disabled={off || busy ? "true" : undefined}
          aria-busy={busy ? "true" : undefined}
          onClick={click}
          onKeyDown={keyDown}
        >
          {content}
        </a>
        {status}
      </>
    );
  }
  const { href: _unused, ...button } =
    rest as ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
  return (
    <>
      <BaseButton
        {...button}
        type={button.type ?? "button"}
        className={cls}
        disabled={disabled}
        aria-disabled={busy ? "true" : undefined}
        aria-busy={busy ? "true" : undefined}
        onClick={click}
        onKeyDown={keyDown}
      >
        {content}
      </BaseButton>
      {status}
    </>
  );
}
