import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { useDismissStaleToasts } from "../hooks/use-dismiss-stale-toasts";

export type ToastTone = "success" | "info" | "warning" | "error";

/** The data a toast carries next to Base UI's own fields. */
export interface ToastData {
  actionLabel?: string;
}

export interface NotifyOptions {
  /**
   * One id per action (`"course-create"`): firing it again replaces the toast
   * in place, so a later success takes the earlier error off the screen
   */
  id?: string;
  tone?: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  /** an action ("Geri al") must also exist elsewhere: a toast disappears */
  action?: { label: string; onClick: () => void };
}

/**
 * Timing per canvas rule 21: success and info close themselves after 6 s, or
 * 10 s with an action; warning and error stay (`timeout: 0`) and are announced
 * urgently (`priority: "high"`).
 */
export function toastTiming(
  tone: ToastTone,
  hasAction: boolean
): { timeout: number; priority: "low" | "high" } {
  if (tone === "warning" || tone === "error")
    return { timeout: 0, priority: "high" };
  return { timeout: hasAction ? 10000 : 6000, priority: "low" };
}

/**
 * `notify` and `dismiss` for the app's one `Toaster`. A toast confirms what this
 * user just did; page state is an `Alert` and a validation error belongs on its
 * `Field`.
 */
export function useToaster() {
  const manager = BaseToast.useToastManager<ToastData>();
  return {
    notify({
      id,
      tone = "success",
      title,
      description,
      action,
    }: NotifyOptions): string {
      return manager.add({
        id,
        type: tone,
        title,
        description,
        ...toastTiming(tone, Boolean(action)),
        actionProps: action
          ? { children: action.label, onClick: action.onClick }
          : undefined,
        data: action ? { actionLabel: action.label } : undefined,
      });
    },
    dismiss: (id?: string) => manager.close(id),
  };
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager<ToastData>();
  return (
    <>
      {toasts.map((t) => {
        const tone = (t.type as ToastTone | undefined) ?? "success";
        return (
          <BaseToast.Root
            key={t.id}
            toast={t}
            className={`mds-toast mds-toast--${tone}`}
          >
            <span className="mds-toast__icon" aria-hidden="true" />
            <div className="mds-toast__body">
              <BaseToast.Title className="mds-toast__title" render={<p />} />
              <BaseToast.Description
                className="mds-toast__desc"
                render={<p />}
              />
              {t.actionProps ? (
                <div className="mds-toast__action">
                  <BaseToast.Action className="mds-btn mds-btn--mini mds-btn--ghost" />
                </div>
              ) : null}
            </div>
            <BaseToast.Close
              className="mds-btn mds-icon-btn mds-btn--mini mds-btn--ghost mds-toast__close"
              aria-label="Kapat"
            />
          </BaseToast.Root>
        );
      })}
    </>
  );
}

/**
 * Inside `ToastProvider`: on every change of `routeKey` (the pathname) it
 * closes the toasts that were already on screen when the user last acted, so
 * no toast outlives the page it reports on (MDRS-214).
 */
export function DismissStaleToasts({ routeKey }: { routeKey: string }) {
  const { toasts, close } = BaseToast.useToastManager<ToastData>();
  useDismissStaleToasts(routeKey, {
    active: () => toasts.filter((t) => t.transitionStatus !== "ending"),
    version: (t) => `${t.id}:${t.updateKey ?? 0}`,
    dismiss: (t) => close(t.id),
  });
  return null;
}

/** Once per app root (canvas rule 3: `limit={3}`); put it before any toast exists. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <BaseToast.Provider limit={3}>{children}</BaseToast.Provider>;
}

/** The one host for toasts: a "Bildirimler" region fixed at the bottom inline-end. */
export function Toaster({ label = "Bildirimler" }: { label?: string }) {
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className="mds-toaster" aria-label={label}>
        <ToastList />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
