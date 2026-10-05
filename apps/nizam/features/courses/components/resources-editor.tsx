"use client";

import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useTranslations } from "next-intl";
import {
  type CurriculumProblem,
  emptyResource,
  type ResourceDraft,
} from "../present";

/**
 * "Bağlı kaynaklar" on the curriculum (MDRS-279, design nizam "Müderris ve
 * kaynaklar"): the course's resources as links, each a name, an optional
 * short line and the address it opens. Part of the curriculum form: nothing
 * is written until its "Kaydet", and "Vazgeç" puts the saved rows back. The
 * limits are tedrisat's: name 200, line 120, address 500.
 */
export function ResourcesEditor({
  resources,
  onChange,
  shown,
}: {
  resources: ResourceDraft[];
  onChange: (next: ResourceDraft[]) => void;
  /** whether a problem of this row is to be shown (after a refused "Kaydet") */
  shown: (kind: CurriculumProblem, resourceIndex: number) => boolean;
}) {
  const t = useTranslations("nizam.Curriculum");
  const patch = (ri: number, change: Partial<ResourceDraft>) =>
    onChange(resources.map((r, i) => (i === ri ? { ...r, ...change } : r)));

  return (
    <section
      className="mds-card flex flex-col gap-4"
      aria-labelledby="c-resources"
      data-testid="resources"
    >
      <div className="flex flex-col gap-1">
        <h2 id="c-resources" className="mds-h2">
          {t("resourcesTitle")}
        </h2>
        <p className="mds-caption">{t("resourcesIntro")}</p>
      </div>
      {resources.length === 0 ? (
        <p className="mds-body-sm">{t("resourcesEmpty")}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {resources.map((resource, ri) => (
            <li
              key={resource.id ?? `new-${ri}`}
              className="flex flex-col gap-3 py-4 border-be border-neutral-subtle last:border-be-0"
              data-testid={`resource-${ri}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="mds-label">
                  {t("resourceHeading", { n: ri + 1 })}
                </h3>
                <Button
                  variant="ghost"
                  size="small"
                  type="button"
                  iconLeft={<Icon name="trash" size="sm" />}
                  onClick={() => onChange(resources.filter((_, i) => i !== ri))}
                >
                  {t("removeResource")}
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label={t("resourceNameLabel")}
                  required
                  error={
                    shown("resourceName", ri)
                      ? t("errors.resourceName")
                      : undefined
                  }
                >
                  <Input
                    name={`resource-${ri}-name`}
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
                    name={`resource-${ri}-meta`}
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
                  shown("resourceUrl", ri) ? t("errors.resourceUrl") : undefined
                }
              >
                <Input
                  mono
                  type="url"
                  name={`resource-${ri}-url`}
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
      <div>
        <Button
          variant="outline"
          size="small"
          type="button"
          iconLeft={<Icon name="plus" size="sm" />}
          onClick={() => onChange([...resources, emptyResource()])}
        >
          {t("addResource")}
        </Button>
      </div>
    </section>
  );
}
