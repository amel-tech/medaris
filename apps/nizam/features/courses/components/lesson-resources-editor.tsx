"use client";

import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { useTranslations } from "next-intl";
import {
  type CurriculumProblem,
  emptyLessonResource,
  type LessonResourceDraft,
  moveRow,
} from "../present";

/**
 * "Celsenin kaynakları" on a session of the curriculum (MDRS-286): the
 * session's own links, each a name, an optional short line and the address it
 * opens, as the course's "Bağlı kaynaklar" (`resources-editor.tsx`), whose
 * fields, limits and copy it reuses. They can be added, renamed, reordered
 * and removed. Part of the curriculum form: nothing is written until its
 * "Kaydet", and "Vazgeç" puts the saved rows back. nazar's curriculum has the
 * same list (`apps/nazar/features/curriculum/components`).
 */
export function LessonResourcesEditor({
  prefix,
  resources,
  onChange,
  shown,
  locked,
}: {
  /** the session's field names, `lesson-<week>-<session>` */
  prefix: string;
  resources: LessonResourceDraft[];
  onChange: (next: LessonResourceDraft[]) => void;
  /** whether a problem of this row is to be shown (after a refused "Kaydet") */
  shown: (kind: CurriculumProblem, resourceIndex: number) => boolean;
  /**
   * the course was read content-locked: it carries no addresses, so the rows
   * are shown and kept as they are, never edited
   */
  locked: boolean;
}) {
  const t = useTranslations("nizam.Curriculum");
  const patch = (ri: number, change: Partial<LessonResourceDraft>) =>
    onChange(resources.map((r, i) => (i === ri ? { ...r, ...change } : r)));
  const name = (ri: number, field: "name" | "meta" | "url") =>
    `${prefix}-resource-${ri}-${field}`;

  return (
    <div
      className="border-bs border-neutral-subtle pbs-3"
      data-testid={`resources-${prefix}`}
    >
      <fieldset className="flex min-inline-0 flex-col gap-3 border-0 p-0">
        <legend className="mds-label pbe-1">{t("lessonResourcesTitle")}</legend>
        <p className="mds-caption">
          {t(locked ? "lessonResourcesLocked" : "lessonResourcesIntro")}
        </p>
        {resources.length === 0 ? (
          <p className="mds-body-sm">{t("lessonResourcesEmpty")}</p>
        ) : locked ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {resources.map((resource, ri) => (
              <li
                key={resource.id ?? ri}
                className="flex flex-col py-2 border-be border-neutral-subtle last:border-be-0"
                data-testid={`resource-${prefix}-${ri}`}
              >
                <span className="mds-label" dir="auto">
                  {resource.name}
                </span>
                {resource.meta ? (
                  <span className="mds-caption" dir="auto">
                    {resource.meta}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {resources.map((resource, ri) => (
              <li
                key={resource.id ?? `new-${ri}`}
                className="flex flex-col gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                data-testid={`resource-${prefix}-${ri}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="mds-caption">
                    {t("resourceHeading", { n: ri + 1 })}
                  </span>
                  <span className="flex items-center gap-1">
                    <IconButton
                      size="small"
                      icon={<Icon name="chevronUp" size="sm" />}
                      label={t("moveResourceUp")}
                      disabled={ri === 0}
                      onClick={() => onChange(moveRow(resources, ri, ri - 1))}
                    />
                    <IconButton
                      size="small"
                      icon={<Icon name="chevronDown" size="sm" />}
                      label={t("moveResourceDown")}
                      disabled={ri === resources.length - 1}
                      onClick={() => onChange(moveRow(resources, ri, ri + 1))}
                    />
                    <Button
                      variant="ghost"
                      size="small"
                      type="button"
                      iconLeft={<Icon name="trash" size="sm" />}
                      onClick={() =>
                        onChange(resources.filter((_, i) => i !== ri))
                      }
                    >
                      {t("removeResource")}
                    </Button>
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={t("resourceNameLabel")}
                    required
                    error={
                      shown("lessonResourceName", ri)
                        ? t("errors.resourceName")
                        : undefined
                    }
                  >
                    <Input
                      name={name(ri, "name")}
                      value={resource.name}
                      maxLength={200}
                      dir="auto"
                      onChange={(e) => patch(ri, { name: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={t("resourceMetaLabel")}
                    help={t("resourceMetaHelp")}
                  >
                    <Input
                      name={name(ri, "meta")}
                      value={resource.meta}
                      maxLength={120}
                      dir="auto"
                      onChange={(e) => patch(ri, { meta: e.target.value })}
                    />
                  </Field>
                </div>
                <Field
                  label={t("resourceUrlLabel")}
                  required
                  help={t("resourceUrlHelp")}
                  error={
                    shown("lessonResourceUrl", ri)
                      ? t("errors.resourceUrl")
                      : undefined
                  }
                >
                  <Input
                    mono
                    type="url"
                    name={name(ri, "url")}
                    value={resource.url}
                    maxLength={500}
                    placeholder="https://…"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => patch(ri, { url: e.target.value })}
                  />
                </Field>
              </li>
            ))}
          </ol>
        )}
        {locked ? null : (
          <div>
            <Button
              variant="outline"
              size="small"
              type="button"
              iconLeft={<Icon name="plus" size="sm" />}
              onClick={() => onChange([...resources, emptyLessonResource()])}
            >
              {t("addResource")}
            </Button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
