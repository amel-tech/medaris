import { formatFileSize } from "@medaris/services/file-rules";
import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import { fileKind, type StoredFile } from "../files";

/**
 * A stored file as a row shows it (MDRS-287, MDRS-290): its name as a plain
 * download link to this app's route, a chip of its type and its size. The
 * route answers `Content-Disposition: attachment` with the stored name, so the
 * browser saves it and stays on the page. No `download` attribute: a refusal
 * then comes back to the page with `?fileError=` (or goes to sign-in) rather
 * than being saved as the file. Without `href` (a row of a content-locked
 * read) the name is shown without a link.
 */
export function FileLink({
  file,
  href,
  locale,
}: {
  file: StoredFile;
  href: string | null;
  locale: string;
}) {
  const t = useTranslations("nazar");
  const kind = fileKind(file.contentType);
  return (
    <span
      className="flex min-inline-0 flex-wrap items-center gap-2"
      data-testid="file-link"
    >
      <Icon name={kind === "pdf" ? "pdf" : "doc"} size="sm" />
      {href ? (
        <a
          className="mds-link min-inline-0 break-words"
          href={href}
          aria-label={t("Files.downloadLabel", { name: file.name })}
        >
          <bdi>{file.name}</bdi>
        </a>
      ) : (
        <bdi className="min-inline-0 break-words">{file.name}</bdi>
      )}
      <Badge variant="outline">{t(`Files.kinds.${kind}`)}</Badge>
      <span className="mds-caption">
        {formatFileSize(file.sizeBytes, locale)}
      </span>
    </span>
  );
}
