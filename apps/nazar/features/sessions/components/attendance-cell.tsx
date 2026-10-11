import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import type { AttendanceView } from "../attendance";

/**
 * The "Katılım" cell (MDRS-283): the ways in of one celse joined by " · " —
 * "Zoom · YouTube yayını", "Yalnız yayın", "Yüz yüze", "Yüz yüze · YouTube
 * yayını" — or "Eksik" in the warning style for a celse still ahead that has
 * none. Celseler and the Pano draw it the same way.
 */
export function AttendanceCell({ view }: { view: AttendanceView }) {
  const t = useTranslations("nazar.Sessions.attendance");
  if (view.lack === "missing") {
    return (
      <Badge
        variant="warning"
        icon={<Icon name="warning" size="sm" />}
        data-testid="attendance-missing"
      >
        {t("missing")}
        <span className="mds-visually-hidden">: {t("missingDetail")}</span>
      </Badge>
    );
  }
  if (view.lack === "none") {
    return <span className="text-neutral-muted">{t("none")}</span>;
  }
  const parts: Array<{ key: string; node: ReactNode }> = [];
  if (view.inPerson) {
    parts.push({ key: "in-person", node: <span>{t("inPerson")}</span> });
  }
  if (view.platform) {
    parts.push({
      key: "meeting",
      node: (
        <PlatformChip
          platform={view.platform.id}
          host={view.platform.host}
          unknownLabel={t("unknownPlatform")}
        />
      ),
    });
  }
  if (view.stream) {
    parts.push({
      key: "stream",
      node: (
        <span data-testid="stream-set">
          {t(view.stream === "alone" ? "streamOnly" : "stream")}
        </span>
      ),
    });
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          {part.node}
        </Fragment>
      ))}
    </span>
  );
}
