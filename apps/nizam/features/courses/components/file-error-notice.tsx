"use client";

import {
  FILE_ERROR_PARAM,
  fileDownloadError,
} from "@medaris/services/file-rules";
import { toast } from "@medaris/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Why a file could not be downloaded (MDRS-287). A file on the curriculum is
 * a plain link (`ResourceFileLine`), so the page cannot read a refusal: the
 * file proxy sends the browser back here with `?fileError=<reason>` instead.
 * This says it once, in an error toast that stays until it is closed, and
 * takes the parameter off the address so a reload or a copied link does not
 * say it again. Draws nothing.
 */
export function FileErrorNotice() {
  const t = useTranslations("nizam.Curriculum.downloadErrors");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(FILE_ERROR_PARAM)) return;
    const reason = fileDownloadError(url.searchParams.get(FILE_ERROR_PARAM));
    url.searchParams.delete(FILE_ERROR_PARAM);
    window.history.replaceState(null, "", url);
    if (reason) {
      toast.error(t("title"), { id: "file-error", description: t(reason) });
    }
  }, [t]);

  return null;
}
