"use client";

import {
  FILE_ERROR_PARAM,
  fileDownloadError,
} from "@medaris/services/file-rules";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Why a file could not be downloaded (MDRS-287, MDRS-290). A file is a plain
 * link (`FileLink`), so the page cannot read a refusal: the file proxy sends
 * the browser back here with `?fileError=<reason>` instead. This says it once,
 * as an error toast that stays until it is closed, and takes the parameter
 * off the address so a reload or a copied link does not say it again. Draws
 * nothing; Müfredat and Ödevler mount it.
 */
export function FileErrorNotice() {
  const t = useTranslations("nazar.Files.downloadErrors");
  const { notify } = useToaster();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(FILE_ERROR_PARAM)) return;
    const reason = fileDownloadError(url.searchParams.get(FILE_ERROR_PARAM));
    url.searchParams.delete(FILE_ERROR_PARAM);
    window.history.replaceState(null, "", url);
    if (reason) {
      notify({
        id: "file-error",
        tone: "error",
        title: t("title"),
        description: t(reason),
      });
    }
  }, [t, notify]);

  return null;
}
