"use client";

import {
  FILE_ERROR_PARAM,
  type FileDownloadError,
  fileDownloadError,
} from "@medaris/services/file-rules";
import { toast } from "@medaris/ui/components/sonner";
import { useEffect } from "react";

/** `tedrisLearn.FileDownload`: the toast's title and a sentence per reason. */
export type FileErrorLabels = Record<"title" | FileDownloadError, string>;

/**
 * Why a file could not be downloaded (MDRS-287, MDRS-290). A file is a plain
 * link, so the page cannot read a refusal: the file proxy sends the browser
 * back here with `?fileError=<reason>` instead. This says it once, in a toast
 * that stays until it is closed, and takes the parameter off the address so
 * a reload or a copied link does not say it again. Draws nothing; the words
 * come as props so the server celse page and the client course page both
 * mount it.
 */
export function FileErrorNotice({ labels }: { labels: FileErrorLabels }) {
  // Runs again whenever the page draws new labels; by then the parameter is
  // gone, so the toast is shown once.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(FILE_ERROR_PARAM)) return;
    const reason = fileDownloadError(url.searchParams.get(FILE_ERROR_PARAM));
    url.searchParams.delete(FILE_ERROR_PARAM);
    window.history.replaceState(null, "", url);
    if (reason) {
      toast.error(labels.title, {
        id: "file-error",
        description: labels[reason],
      });
    }
  }, [labels]);

  return null;
}
