"use client";

import { Field } from "@medaris/ui/mds/field";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRef, useState } from "react";
import {
  allTimeZones,
  FEATURED_TIME_ZONES,
  needsFullList,
  OTHER_ZONE,
} from "../account-view";
import { saveTimeZone } from "../actions";

export interface TimeZoneFormLabels {
  zone: string;
  zoneHelp: string;
  other: string;
  allZones: string;
  allZonesHelp: string;
  savedTitle: string;
  savedText: string;
  failedTitle: string;
  failedText: string;
  /** the featured zones' names, by IANA id */
  names: Record<string, string>;
}

/**
 * "Saat dilimi" (nizam 36, 47): saved the moment a zone is chosen, with a
 * toast; a failed save puts the previous zone back and says so. The short
 * list is the one the design names; "Diğer…" opens every zone the browser
 * knows.
 */
export function TimeZoneForm({
  saved,
  labels,
}: {
  saved: string;
  labels: TimeZoneFormLabels;
}) {
  const toaster = useToaster();
  const [zone, setZone] = useState(saved);
  const [full, setFull] = useState(needsFullList(saved));
  const [busy, setBusy] = useState(false);
  // the zone that is saved, for the rollback after a refused save
  const confirmed = useRef(saved);

  const choose = async (next: string) => {
    if (next === confirmed.current) return;
    setZone(next);
    setBusy(true);
    const res = await saveTimeZone(next);
    setBusy(false);
    if (res.success) {
      confirmed.current = next;
      toaster.notify({
        tone: "success",
        title: labels.savedTitle,
        description: labels.savedText,
      });
      return;
    }
    setZone(confirmed.current);
    toaster.notify({
      tone: "error",
      title: labels.failedTitle,
      description: labels.failedText,
    });
  };

  const featured = [
    ...FEATURED_TIME_ZONES.map((id) => ({
      value: id as string,
      label: labels.names[id] ?? id,
    })),
    { value: OTHER_ZONE, label: labels.other },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Field label={labels.zone} help={labels.zoneHelp}>
        <Select
          options={featured}
          value={full ? OTHER_ZONE : zone}
          disabled={busy}
          onChange={(value) => {
            if (!value) return;
            if (value === OTHER_ZONE) {
              setFull(true);
              return;
            }
            setFull(false);
            void choose(value);
          }}
          aria-label={labels.zone}
        />
      </Field>
      {full ? (
        <Field label={labels.allZones} help={labels.allZonesHelp}>
          <Select
            options={allTimeZones(zone).map((id) => ({
              value: id,
              label: id.replaceAll("_", " "),
            }))}
            value={zone}
            disabled={busy}
            onChange={(value) => value && void choose(value)}
            aria-label={labels.allZones}
          />
        </Field>
      ) : null}
    </div>
  );
}
