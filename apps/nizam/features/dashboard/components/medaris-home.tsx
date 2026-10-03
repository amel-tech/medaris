"use client";

import type {
  DashboardBanResponse,
  GrantResponse,
  NizamDashboardResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Stat } from "@medaris/ui/mds/stat";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { codeKey, formatDay } from "../../permissions/present";
import { fieldLabel } from "../../platform-admin/present";
import {
  footnoteParts,
  grantCards,
  type Messages,
  momentLabel,
  pendingTotal,
} from "../present";
import { HomeSection, Row, RowList } from "./home-parts";

interface Props {
  data: NizamDashboardResponse;
  /** what the başnazım gave the viewer; null when it could not be read */
  grants: GrantResponse[] | null;
  /** the server's clock, so the server and the browser agree on "Bugün" */
  nowIso: string;
}

/**
 * The Medaris home page (nizam 01 for the başnazım, 05 for a Medaris nazımı):
 * the greeting with how many requests wait, the platform numbers, and a card
 * per queue with its newest rows. One read feeds it; a section the viewer may
 * not see arrives `null` and is not drawn. The nazım's page adds "İzinleriniz"
 * beside the cards and leaves out the course numbers.
 */
export function MedarisHome({ data, grants, nowIso }: Props) {
  const t = useTranslations("nizam.Dashboard") as unknown as Messages;
  const ti = useTranslations("nizam.InactivePage") as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const zone = { locale, timeZone };
  const now = new Date(nowIso);
  const words = { today: t("today"), yesterday: t("yesterday") };
  const when = (at: Date | string) => momentLabel(at, now, zone, words);
  const base = `/${locale}`;
  const chief = data.viewer === "CHIEF";

  const total = pendingTotal(data.pendingTotals);
  const passiveCount = data.inactiveScopeCount ?? 0;
  const counts = data.platformCounts;

  const greeting = data.greetingName
    ? t("greeting", { name: data.greetingName })
    : t("greetingAnon");

  const applications = data.latestApplications ? (
    <HomeSection
      id="home-applications"
      title={t("applications.title")}
      link={{
        href: `${base}/talepler/kosk-basvurulari`,
        label: t("seeAll"),
      }}
    >
      {data.latestApplications.length === 0 ? (
        <EmptyState>{t("applications.empty")}</EmptyState>
      ) : (
        <RowList testId="home-applications-list">
          {data.latestApplications.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              entity
              title={a.name}
              testId="home-application"
              captions={[
                [
                  fieldLabel(a.field),
                  a.applicantName ?? t("unknownPerson"),
                  when(a.createdAt),
                ].join(" · "),
              ]}
              action={
                <Button
                  variant="outline"
                  size="small"
                  href={`${base}/talepler/kosk-basvurulari?secili=${a.id}`}
                  aria-label={t("reviewLabel", { name: a.name })}
                >
                  {t("review")}
                </Button>
              }
            />
          ))}
        </RowList>
      )}
    </HomeSection>
  ) : null;

  const decks = data.latestDeckRequests ? (
    <HomeSection
      id="home-decks"
      title={t("decks.title")}
      link={{
        href: `${base}/talepler/deste-yayin-istekleri`,
        label: t("seeAll"),
      }}
    >
      {data.latestDeckRequests.length === 0 ? (
        <EmptyState>{t("decks.empty")}</EmptyState>
      ) : (
        <RowList testId="home-decks-list">
          {data.latestDeckRequests.map((d) => (
            <Row
              key={d.id}
              name={d.title}
              entity
              title={d.title}
              testId="home-deck"
              captions={[
                [
                  d.ownerName ?? t("unknownPerson"),
                  t("decks.cards", { count: d.cardCount }),
                  when(d.requestedAt),
                ].join(" · "),
              ]}
              action={
                <Button
                  variant="outline"
                  size="small"
                  href={`${base}/talepler/deste-yayin-istekleri?secili=${d.id}`}
                  aria-label={t("reviewLabel", { name: d.title })}
                >
                  {t("review")}
                </Button>
              }
            />
          ))}
        </RowList>
      )}
    </HomeSection>
  ) : null;

  const permanentBans =
    data.pendingTotals.permanentBanRequests != null && !chief ? (
      <HomeSection id="home-permanent-bans" title={t("permanentBans.title")}>
        <EmptyState>{t("permanentBans.empty")}</EmptyState>
      </HomeSection>
    ) : null;

  const passive = data.inactiveScopes ? (
    <HomeSection
      id="home-passive"
      title={t("passive.title")}
      link={{ href: `${base}/pasif-kapsamlar`, label: t("seeAll") }}
    >
      {data.inactiveScopes.length === 0 ? (
        <EmptyState>{t("passive.empty")}</EmptyState>
      ) : (
        <RowList testId="home-passive-list">
          {data.inactiveScopes.map((s) => (
            <Row
              key={`${s.type}:${s.id}`}
              name={s.name}
              entity
              title={s.name}
              testId="home-passive-scope"
              captions={[
                [
                  s.koskName
                    ? ti("kindInKosk", {
                        kind: ti(`kinds.${s.type}`),
                        kosk: s.koskName,
                      })
                    : ti(`kinds.${s.type}`),
                  ti(`reasons.${s.type}_${s.reason}`),
                  t("passive.since", {
                    date: formatDay(s.since, locale, timeZone),
                  }),
                ].join(" · "),
              ]}
              action={
                <Button
                  variant="outline"
                  size="small"
                  href={`${base}/pasif-kapsamlar`}
                  aria-label={t("passive.assignLabel", {
                    action: t(`passive.assign.${s.type}`),
                    name: s.name,
                  })}
                >
                  {t(`passive.assign.${s.type}`)}
                </Button>
              }
            />
          ))}
        </RowList>
      )}
    </HomeSection>
  ) : null;

  const banLine = (b: DashboardBanResponse) =>
    [
      b.scope === "COURSE"
        ? t("bans.courseBan", { name: b.courseTitle ?? "" })
        : t("bans.koskBan", { name: b.koskName ?? "" }),
      t("bans.placedBy", { name: b.bannedByName ?? t("unknownPerson") }),
      when(b.createdAt),
    ].join(" · ");

  const bans = data.latestBans ? (
    <HomeSection id="home-bans" title={t("bans.title")}>
      {data.latestBans.length === 0 ? (
        <EmptyState>{t("bans.empty")}</EmptyState>
      ) : (
        <RowList testId="home-bans-list">
          {data.latestBans.map((b) => (
            <Row
              key={b.id}
              name={b.userName ?? "?"}
              title={b.userName ?? t("unknownPerson")}
              testId="home-ban"
              captions={[banLine(b), t("bans.reason", { reason: b.reason })]}
              action={
                <Button
                  variant="outline"
                  size="small"
                  href={`${base}/yasaklamalar`}
                  aria-label={t("reviewLabel", {
                    name: b.userName ?? t("unknownPerson"),
                  })}
                >
                  {t("review")}
                </Button>
              }
            />
          ))}
        </RowList>
      )}
      <a className="mds-link self-start" href={`${base}/yasaklamalar`}>
        {t("bans.goTo")}
      </a>
    </HomeSection>
  ) : null;

  const stats = (
    <section
      aria-label={t("counts.title")}
      className={
        chief
          ? "grid gap-grid sm:grid-cols-2 lg:grid-cols-4"
          : "grid gap-grid sm:grid-cols-2"
      }
      data-testid="home-counts"
    >
      <Stat label={t("counts.kosk")} value={counts.kosk}>
        {counts.unlistedKosk > 0 ? (
          <span className="mds-caption">
            {t("counts.unlisted", { count: counts.unlistedKosk })}
          </span>
        ) : null}
        <a className="mds-link" href={`${base}/kosks`}>
          {t("counts.goKosks")}
        </a>
      </Stat>
      <Stat label={t("counts.madrasah")} value={counts.madrasah}>
        {counts.inactiveMadrasah > 0 ? (
          <span className="mds-caption">
            {t("counts.passive", { count: counts.inactiveMadrasah })}
          </span>
        ) : null}
        <a className="mds-link" href={`${base}/medreseler`}>
          {t("counts.goMadrasahs")}
        </a>
      </Stat>
      {counts.course != null ? (
        <Stat label={t("counts.course")} value={counts.course}>
          {(counts.inactiveCourse ?? 0) > 0 ? (
            <span className="mds-caption">
              {t("counts.passive", { count: counts.inactiveCourse ?? 0 })}
            </span>
          ) : null}
        </Stat>
      ) : null}
      {counts.enrolledStudents != null ? (
        <Stat label={t("counts.students")} value={counts.enrolledStudents} />
      ) : null}
    </section>
  );

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="mds-h1">{t("title")}</h1>
        <p data-testid="home-greeting">
          {greeting}{" "}
          {total > 0 ? t("pending", { count: total }) : t("pendingNone")}
        </p>
      </div>
      {data.can.openKosk ? (
        <Button
          href={`${base}/kosks?ac=1`}
          iconLeft={<Icon name="plus" size="sm" />}
        >
          {t("openKosk")}
        </Button>
      ) : null}
    </header>
  );

  const passiveAlert =
    passiveCount > 0 ? (
      <Alert
        tone="warning"
        title={t("passive.alertTitle", { count: passiveCount })}
      >
        <p data-testid="home-passive-alert">
          {t("passive.alertBody", {
            names: (data.inactiveScopes ?? []).map((s) => s.name).join(", "),
            count: passiveCount,
          })}
        </p>
      </Alert>
    ) : null;

  if (chief) {
    return (
      <div
        className="flex flex-col gap-section [font-family:var(--font-ui)]"
        data-testid="home-chief"
      >
        {header}
        {passiveAlert}
        {stats}
        <div className="grid items-start gap-section lg:grid-cols-2">
          {applications}
          {decks}
          {passive}
          {bans}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="home-medaris"
    >
      {header}
      <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-section">
          {stats}
          {applications}
          {decks}
          {permanentBans}
          {passive}
        </div>
        <div className="flex flex-col gap-section">
          <Grants grants={grants} locale={locale} timeZone={timeZone} />
          {bans}
        </div>
      </div>
    </div>
  );
}

/** "İzinleriniz": what the başnazım gave the viewer, read only; a lapsed grant is not here. */
function Grants({
  grants,
  locale,
  timeZone,
}: {
  grants: GrantResponse[] | null;
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations("nizam.Dashboard") as unknown as Messages;
  const tp = useTranslations("nizam.PermissionCatalog") as unknown as Messages;
  const cards = grants ? grantCards(grants) : [];
  const day = (date: Date) => formatDay(date, locale, timeZone);
  const sentence = (code: string) => tp(`permissions.${codeKey(code)}.short`);
  const foot = footnoteParts(cards, day);

  return (
    <HomeSection id="home-grants" title={t("grants.title")}>
      {grants === null ? (
        <Alert tone="error" title={t("grants.loadFailedTitle")}>
          <p>{t("grants.loadFailed")}</p>
        </Alert>
      ) : cards.length === 0 ? (
        <EmptyState>{t("grants.empty")}</EmptyState>
      ) : (
        <>
          <ul
            className="mds-card m-0 flex list-none flex-col gap-0 p-0"
            data-testid="home-grants-list"
          >
            {cards.map((card) => (
              <li
                key={card.id}
                className="flex flex-col gap-1 border-be border-neutral-subtle p-card last:border-be-0"
                data-testid="home-grant"
              >
                <bdi className="font-semibold">
                  {card.kind === "group"
                    ? card.name
                    : tp(`permissions.${codeKey(card.name)}.title`)}
                </bdi>
                <span className="mds-caption">
                  {[
                    card.kind === "group"
                      ? t("grants.group", { count: card.codes.length })
                      : t("grants.single"),
                    card.expiresAt
                      ? t("grants.until", { date: day(card.expiresAt) })
                      : t("grants.noEnd"),
                  ].join(" · ")}
                </span>
                {card.kind === "group" ? (
                  <span className="mds-caption">
                    {card.codes.map(sentence).join(" · ")}
                  </span>
                ) : (
                  <GrantNote code={card.name} />
                )}
              </li>
            ))}
          </ul>
          <p className="mds-caption" data-testid="home-grants-note">
            {foot.others.length === 0 || !foot.commonDay
              ? t("grants.noteOneDay", {
                  givers: foot.givers.join(", ") || t("grants.chief"),
                  date: foot.commonDay ?? "",
                })
              : t("grants.noteManyDays", {
                  givers: foot.givers.join(", ") || t("grants.chief"),
                  others: foot.others
                    .map(
                      ({ card, day: d }) =>
                        `${t("grants.otherOne", {
                          name:
                            card.kind === "group"
                              ? card.name
                              : sentence(card.name),
                          date: d,
                        })}`
                    )
                    .join(", "),
                  date: foot.commonDay,
                })}
          </p>
        </>
      )}
    </HomeSection>
  );
}

/** The small print under a single permission, when the catalog has one. */
function GrantNote({ code }: { code: string }) {
  const tp = useTranslations("nizam.PermissionCatalog");
  const key = `permissions.${codeKey(code)}.help`;
  return tp.has(key as never) ? (
    <span className="mds-caption">{tp(key as never)}</span>
  ) : null;
}
