"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { AppProviders } from "@medaris/ui/mds/app-providers";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Field } from "@medaris/ui/mds/field";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { regenerateMyCalendarFeed } from "../actions";

type FeedLink = { url: string; webcalUrl: string };

/** The status tedrisat reports: when the current link was issued, or null without one. */
export type CalendarFeedStatus = { createdAt: string | null } | null;

const MASK = "••••••••••••••••••••••••••••••••";

const CopyField = ({
  id,
  label,
  help,
  value,
  masked,
  copyLabel,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  masked: boolean;
  copyLabel: string;
}) => {
  const t = useTranslations("tedris.CalendarSubscription");
  const toaster = useToaster();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toaster.notify({ tone: "success", title: t("copied") });
    } catch {
      // No clipboard access (an insecure origin, a refused permission): the
      // field is left selected so the viewer can still copy by hand.
      (document.getElementById(id) as HTMLInputElement | null)?.select();
      toaster.notify({ tone: "warning", title: t("copyFailed") });
    }
  };

  return (
    <Field label={label} help={help}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          mono
          readOnly
          className="min-inline-0 flex-1"
          value={masked ? MASK : value}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="secondary"
          iconLeft={<Icon name="copy" size="sm" />}
          onClick={copy}
          disabled={masked}
          aria-label={copyLabel}
        >
          {t("copy")}
        </Button>
      </div>
    </Field>
  );
};

const AsideItem = ({
  icon,
  children,
}: {
  icon: IconName;
  children: ReactNode;
}) => (
  <li className="flex items-start gap-3 py-3 border-be border-neutral-subtle last:border-be-0">
    <Icon name={icon} size="sm" />
    <span className="mds-body-sm">{children}</span>
  </li>
);

const Steps = ({ keys }: { keys: ReactNode[] }) => (
  <ol className="m-0 flex list-decimal flex-col gap-2 ps-5 mds-body-sm">
    {keys.map((step, i) => (
      <li key={i}>{step}</li>
    ))}
  </ol>
);

/**
 * The body of "Takvim aboneliği" (design tedris/23, MDRS-120/163).
 *
 * tedrisat keeps only a hash of the feed secret, so a link that already exists
 * cannot be shown again: the page says one exists, shows its fields masked and
 * offers a new one; a link just issued is shown, with the warning to copy it,
 * until the viewer leaves. Renewing always asks first: a new link silently
 * stops every calendar subscribed to the old one.
 */
export const CalendarSubscription = ({
  status,
}: {
  status: CalendarFeedStatus;
}) => {
  const t = useTranslations("tedris.CalendarSubscription");
  const format = useFormatter();
  const [issuedAt, setIssuedAt] = useState(status?.createdAt ?? null);
  const [link, setLink] = useState<FeedLink | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const issue = () => {
    setFailed(false);
    startTransition(async () => {
      const result = await regenerateMyCalendarFeed();
      setConfirming(false);
      if (!result.success) {
        setFailed(true);
        return;
      }
      setLink({ url: result.data.url, webcalUrl: result.data.webcalUrl });
      setIssuedAt(new Date(result.data.createdAt).toISOString());
    });
  };

  // A link is already there, or the page could not ask: renewing is a
  // decision. Only a page that knows there is none creates without asking.
  const needsConfirmation = !link && (issuedAt !== null || status === null);
  const hasLink = link !== null || issuedAt !== null;

  const code = (chunks: ReactNode) => (
    <code className="mds-code" dir="ltr">
      {chunks}
    </code>
  );

  return (
    <AppProviders>
      <div className="grid items-start gap-6 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex min-inline-0 flex-col gap-6">
          <Card title={t("cardTitle")} headingLevel={2}>
            <div className="flex flex-col gap-5 mbs-4">
              {link ? (
                <Alert tone="warning" title={t("copyNowTitle")}>
                  {t("copyNowText")}
                </Alert>
              ) : null}

              {hasLink ? (
                <>
                  <CopyField
                    id="calendar-google"
                    label={t("googleFor")}
                    help={t("googleHelp")}
                    value={link?.url ?? ""}
                    masked={link === null}
                    copyLabel={t("copyGoogle")}
                  />
                  <CopyField
                    id="calendar-apple"
                    label={t("appleFor")}
                    help={t("appleHelp")}
                    value={link?.webcalUrl ?? ""}
                    masked={link === null}
                    copyLabel={t("copyApple")}
                  />
                  {link === null ? (
                    <p className="mds-body-sm">{t("hidden")}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {link ? (
                      <Button
                        variant="secondary"
                        href={link.webcalUrl}
                        iconLeft={<Icon name="calendarPlus" size="sm" />}
                      >
                        {t("appleOpen")}
                      </Button>
                    ) : null}
                    {issuedAt ? (
                      <span className="mds-caption">
                        {t("createdAt", {
                          date: format.dateTime(new Date(issuedAt), {
                            dateStyle: "full",
                            timeStyle: "short",
                          }),
                        })}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="mds-body-sm">
                  {status === null ? t("unknown") : t("createHelp")}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-bs border-neutral-subtle pbs-5">
                {needsConfirmation ? (
                  <Button
                    variant="outline"
                    iconLeft={<Icon name="repeat" size="sm" />}
                    onClick={() => setConfirming(true)}
                    loading={pending}
                  >
                    {t("regenerate")}
                  </Button>
                ) : (
                  <Button
                    variant={link ? "outline" : "primary"}
                    iconLeft={<Icon name="repeat" size="sm" />}
                    onClick={link ? () => setConfirming(true) : issue}
                    loading={pending}
                  >
                    {hasLink ? t("regenerate") : t("create")}
                  </Button>
                )}
                {hasLink ? (
                  <span className="mds-caption">{t("regenerateHelp")}</span>
                ) : null}
              </div>
              {failed ? (
                <Alert tone="error" role="alert">
                  {t("failed")}
                </Alert>
              ) : null}
            </div>
          </Card>

          <Card title={t("howTitle")} headingLevel={2}>
            <div className="grid gap-6 mbs-4 grid-cols-2 max-md:grid-cols-1">
              <section className="flex flex-col gap-3">
                <h3 className="mds-h4">{t("googleTitle")}</h3>
                <Steps
                  keys={[
                    t.rich("googleStep1", { code }),
                    t("googleStep2"),
                    t("googleStep3"),
                  ]}
                />
                <p className="mds-caption">{t("googlePhone")}</p>
              </section>
              <section className="flex flex-col gap-3">
                <h3 className="mds-h4">{t("appleTitle")}</h3>
                <Steps
                  keys={[t("appleStep1"), t("appleStep2"), t("appleStep3")]}
                />
              </section>
            </div>
          </Card>

          <Alert tone="neutral" title={t("delayTitle")}>
            {t("delayText")}
          </Alert>
        </div>

        <aside className="flex flex-col gap-4">
          <Card title={t("whatTitle")} headingLevel={2}>
            <ul className="m-0 flex list-none flex-col p-0 mbs-2">
              <AsideItem icon="calendar">{t("what1")}</AsideItem>
              <AsideItem icon="repeat">{t("what2")}</AsideItem>
              <AsideItem icon="link">{t("what3")}</AsideItem>
              <AsideItem icon="eyeOff">{t("what4")}</AsideItem>
            </ul>
          </Card>
          <Card title={t("privateTitle")} headingLevel={2}>
            <p className="mds-body-sm mbs-2">{t("privateText")}</p>
          </Card>
        </aside>
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        confirmLabel={t("confirmAction")}
        cancelLabel={t("confirmCancel")}
        confirmVariant="primary"
        confirmLoading={pending}
        onConfirm={issue}
      >
        {t("confirmText")}
      </AlertDialog>
    </AppProviders>
  );
};
