"use client";

import { toast } from "@medaris/ui/components/sonner";
import { useEffect } from "react";

/**
 * The toast a failed role read raises next to the page's Alert (design
 * nizam/04 §3: "5xx'de toast"). An error toast stays until it is closed.
 */
export function LoadFailedToast({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  useEffect(() => {
    const id = toast.error(title, {
      description,
      duration: Number.POSITIVE_INFINITY,
    });
    return () => {
      toast.dismiss(id);
    };
  }, [title, description]);
  return null;
}
