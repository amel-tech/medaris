"use client";

import { Field } from "@medaris/ui/mds/field";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { listTimeZones } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateTimeZone } from "../actions";
import {
  commonZoneChoices,
  isCommonZone,
  OTHER_ZONE,
  otherZoneChoices,
} from "../time-zone";

export interface TimeZoneFormLabels {
  zone: string;
  help: string;
  other: string;
  otherZones: string;
  saved: string;
  failedTitle: string;
  failed: string;
}

/**
 * The time zone select of nazir 20. There is no save button: a choice is
 * saved the moment it is made (`PATCH /me`), the page is refreshed so that
 * every date on it is read in the new zone, and a failed save puts the
 * previous zone back and says so in a toast. "Diğer…" opens the full list of
 * zones in a second select; picking from it saves the same way.
 */
export function TimeZoneForm({
  current,
  labels,
}: {
  current: string;
  labels: TimeZoneFormLabels;
}) {
  const router = useRouter();
  const { notify } = useToaster();
  const [, startTransition] = useTransition();
  const [zone, setZone] = useState(current);
  const [openOther, setOpenOther] = useState(!isCommonZone(current));

  const common = useMemo(() => commonZoneChoices(labels.other), [labels.other]);
  // The runtime's whole list is only built once someone asks for it.
  const others = useMemo(
    () => (openOther ? otherZoneChoices(listTimeZones(zone)) : []),
    [openOther, zone]
  );

  const save = (next: string) => {
    if (next === zone) return;
    const previous = zone;
    setZone(next);
    startTransition(async () => {
      // A dropped connection rejects the action instead of answering, and
      // that must read as a failed save, not as the page's error screen.
      const saved = await updateTimeZone(next).then(
        (result) => result.success,
        () => false
      );
      if (saved) {
        notify({ tone: "success", title: labels.saved });
        router.refresh();
      } else {
        setZone(previous);
        setOpenOther(!isCommonZone(previous));
        notify({
          tone: "error",
          title: labels.failedTitle,
          description: labels.failed,
        });
      }
    });
  };

  return (
    <>
      <Field label={labels.zone} help={labels.help}>
        <Select
          options={common}
          value={openOther ? OTHER_ZONE : zone}
          onChange={(value) => {
            if (!value) return;
            if (value === OTHER_ZONE) {
              setOpenOther(true);
              return;
            }
            setOpenOther(false);
            save(value);
          }}
        />
      </Field>
      {openOther ? (
        <Field label={labels.otherZones}>
          <Select
            options={others}
            value={isCommonZone(zone) ? null : zone}
            placeholder={labels.other}
            onChange={(value) => {
              if (value) save(value);
            }}
          />
        </Field>
      ) : null}
    </>
  );
}
