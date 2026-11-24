"use client";

import type { CourseTermResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { findTerms } from "@medaris/utils";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import { listCourseTerms } from "../actions/glossary";

type Load =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; terms: CourseTermResponse[] };

/**
 * The "Lügat" tab of the course page: the terms the müderris defined for the
 * course, in the alphabet of the page's language, searched as the talebe
 * types (by the term, its Arabic, either meaning or the example). Read only.
 */
export function CourseGlossaryTab({ courseId }: { courseId: string }) {
  const t = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [query, setQuery] = useState("");

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const result = await listCourseTerms(courseId);
      if (sendToSignIn(result)) return;
      setLoad(
        result.success
          ? { state: "ready", terms: result.data }
          : { state: "failed" }
      );
    } catch {
      setLoad({ state: "failed" });
    }
  }, [courseId]);

  useEffect(() => {
    void read();
  }, [read]);

  if (load.state === "loading") {
    return <output className="mds-caption">{t("glossaryLoading")}</output>;
  }
  if (load.state === "failed") {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="mds-body-sm">{t("glossaryFailed")}</p>
        <div>
          <Button variant="outline" size="small" onClick={() => void read()}>
            {t("glossaryRetry")}
          </Button>
        </div>
      </div>
    );
  }
  if (load.terms.length === 0) {
    return <EmptyState>{t("glossaryEmpty")}</EmptyState>;
  }

  const found = findTerms(load.terms, query, locale);
  return (
    <div className="flex flex-col gap-4">
      <div className="max-inline-[24rem]">
        <Field label={t("glossarySearch")}>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
      </div>
      <output className="mds-caption">
        {t("glossaryCount", { found: found.length, all: load.terms.length })}
      </output>
      {found.length === 0 ? (
        <EmptyState>{t("glossaryNoneFound")}</EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0 border-bs border-neutral-subtle">
          {found.map((term) => (
            <li
              key={term.id}
              className="flex flex-col gap-2 border-be border-neutral-subtle py-4"
            >
              <p className="flex flex-wrap items-baseline gap-3">
                <span className="mds-h4">{term.term}</span>
                {term.arabic ? (
                  <span className="mds-arabic" lang="ar" dir="rtl">
                    {term.arabic}
                  </span>
                ) : null}
              </p>
              <dl className="m-0 flex flex-col gap-1">
                {(
                  [
                    ["glossaryLexical", term.lexicalMeaning],
                    ["glossaryTechnical", term.technicalMeaning],
                    ["glossaryExample", term.example],
                  ] as const
                ).map(([key, text]) =>
                  text ? (
                    <div key={key} className="flex flex-wrap gap-2">
                      <dt className="mds-caption min-inline-[8rem] text-neutral-muted">
                        {t(key)}
                      </dt>
                      <dd
                        className="mds-body-sm m-0 min-inline-0 flex-1 whitespace-pre-line"
                        dir="auto"
                      >
                        {text}
                      </dd>
                    </div>
                  ) : null
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
