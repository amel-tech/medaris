"use client";

import { Fragment, type ReactNode, useId } from "react";
import { Checkbox } from "../mds/checkbox";
import { Field } from "../mds/field";
import { Input } from "../mds/input";
import { RadioGroup } from "../mds/radio-group";
import { Select } from "../mds/select";
import { Textarea } from "../mds/textarea";

/** One text, or the chosen options of a box or a group of boxes. */
export type ProfileFieldValue = string | string[];

export interface ProfileFieldOption {
  value: string;
  label: string;
}

/**
 * How a field is drawn, by the design system's rule for each kind of answer:
 * typed text (`Input`), running text (`Textarea`), one of four to fifteen
 * (`Select`), one of two or three (`RadioGroup`, every option on screen), a
 * box to tick (`Checkbox`), any of a few (a group of boxes), or nothing at all.
 */
export type ProfileFieldKind =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "checkboxes"
  | "hidden";

export interface ProfileFieldSpec {
  /** what the provider calls the field: the posted name and the control's id */
  name: string;
  kind: ProfileFieldKind;
  /** the label; for a lone box, the box's own words, links included */
  label: ReactNode;
  required?: boolean;
  /** shown, not editable and not posted */
  readOnly?: boolean;
  /** one line under the control; an error replaces it */
  help?: ReactNode;
  /** what the provider said was wrong with the last submission */
  error?: ReactNode;
  /** `select`, `radio`, `checkbox` (its one option) and `checkboxes` */
  options?: ProfileFieldOption[];
  defaultValue?: ProfileFieldValue;
  /** a text field's input type: `email`, `tel`, `url`, `number`, `date`… */
  type?: string;
  autoComplete?: string;
  /** Latin-script, left-to-right content (a user name, an address): no capitals, no spelling check */
  latin?: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: string;
  max?: string;
  step?: string;
  rows?: number;
  /** the hidden words a link in the label points at: "Yeni sekmede açılır." */
  labelNote?: { id: string; text: ReactNode };
  /** the group this field belongs to; its header goes over the group's first field */
  group?: { name: string; header: ReactNode; description?: ReactNode };
  /** said when the field is required and left empty, instead of the form's default */
  requiredError?: ReactNode;
  /** a check of a filled-in value, run on submit: the reason it fails, or nothing */
  check?: (value: ProfileFieldValue) => ReactNode | undefined;
}

/** The chosen options, without the empty placeholder some providers start a list with. */
export const valueList = (value: ProfileFieldValue | undefined): string[] =>
  (Array.isArray(value) ? value : value ? [value] : []).filter((v) => v !== "");

const valueText = (value: ProfileFieldValue | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/** A required field left like this fails: nothing typed, nothing chosen. */
export function isEmptyValue(spec: ProfileFieldSpec, value: ProfileFieldValue) {
  return spec.kind === "checkbox" || spec.kind === "checkboxes"
    ? valueList(value).length === 0
    : valueText(value).trim() === "";
}

/** A field answered by choosing rather than typing; its empty message differs. */
export const isChoice = (spec: ProfileFieldSpec) =>
  spec.kind === "select" || spec.kind === "radio" || spec.kind === "checkboxes";

const required = (
  <span className="mds-required" aria-hidden="true">
    *
  </span>
);

export interface ProfileFieldProps {
  spec: ProfileFieldSpec;
  value: ProfileFieldValue;
  onChange: (value: ProfileFieldValue) => void;
  onBlur?: () => void;
  /** the reason to show now: the form's own check, or the provider's */
  error?: ReactNode;
}

/**
 * One field of the provider's user profile, drawn with the `.mds-*` kit
 * (canvas medaris/03 and 10). The control follows `spec.kind`; the label, the
 * required asterisk, the help line and the error that replaces it are the
 * system's in every kind. Controlled: the form that holds the values decides
 * what is shown and what the error is.
 */
export function ProfileField({
  spec,
  value,
  onChange,
  onBlur,
  error,
}: ProfileFieldProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const options = spec.options ?? [];
  const chosen = valueList(value);
  const toggle = (option: string, on: boolean) =>
    onChange(
      on
        ? [...chosen.filter((v) => v !== option), option]
        : chosen.filter((v) => v !== option)
    );

  switch (spec.kind) {
    case "hidden":
      return <input type="hidden" name={spec.name} value={valueText(value)} />;

    case "radio":
      return (
        <RadioGroup
          legend={
            <>
              {spec.label}
              {spec.required ? required : null}
            </>
          }
          name={spec.readOnly ? undefined : spec.name}
          options={options}
          value={valueText(value) || null}
          onChange={onChange}
          required={spec.required}
          disabled={spec.readOnly}
          help={spec.help}
          error={error}
        />
      );

    case "checkbox": {
      const option = options[0]?.value ?? "on";
      return (
        <Field error={error} help={spec.help}>
          <Checkbox
            id={`${spec.name}-${option}`}
            name={spec.readOnly ? undefined : spec.name}
            value={option}
            checked={chosen.includes(option)}
            onCheckedChange={(on) => toggle(option, on)}
            onBlur={onBlur}
            required={spec.required}
            disabled={spec.readOnly}
            label={
              <>
                {spec.label}
                {spec.required ? required : null}
              </>
            }
          />
          {spec.labelNote ? (
            <span className="mds-visually-hidden" id={spec.labelNote.id}>
              {spec.labelNote.text}
            </span>
          ) : null}
        </Field>
      );
    }

    case "checkboxes": {
      const legendId = `${spec.name}-${uid}-legend`;
      const lineId =
        error || spec.help ? `${spec.name}-${uid}-line` : undefined;
      return (
        <fieldset aria-labelledby={legendId} className="mds-choice-group">
          <div className="mds-label" id={legendId}>
            {spec.label}
            {spec.required ? required : null}
          </div>
          {options.map((option) => (
            <Checkbox
              key={option.value}
              id={`${spec.name}-${option.value}`}
              name={spec.readOnly ? undefined : spec.name}
              value={option.value}
              checked={chosen.includes(option.value)}
              onCheckedChange={(on) => toggle(option.value, on)}
              onBlur={onBlur}
              disabled={spec.readOnly}
              aria-invalid={error ? true : undefined}
              aria-describedby={lineId}
              label={option.label}
            />
          ))}
          {error ? (
            <span className="mds-error" id={lineId}>
              {error}
            </span>
          ) : spec.help ? (
            <span className="mds-help" id={lineId}>
              {spec.help}
            </span>
          ) : null}
        </fieldset>
      );
    }

    case "select":
      return (
        <Field
          label={spec.label}
          required={spec.required}
          help={spec.help}
          error={error}
        >
          <Select
            id={spec.name}
            name={spec.readOnly ? undefined : spec.name}
            options={options}
            placeholder={spec.placeholder}
            value={valueText(value) || null}
            onChange={(next) => onChange(next ?? "")}
            required={spec.required}
            disabled={spec.readOnly}
          />
        </Field>
      );

    case "textarea":
      return (
        <Field
          label={spec.label}
          required={spec.required}
          help={spec.help}
          error={error}
        >
          <Textarea
            id={spec.name}
            name={spec.readOnly ? undefined : spec.name}
            dir="auto"
            rows={spec.rows}
            minLength={spec.minLength}
            maxLength={spec.maxLength}
            placeholder={spec.placeholder}
            required={spec.required}
            aria-required={spec.required || undefined}
            readOnly={spec.readOnly}
            value={valueText(value)}
            onChange={(event) => onChange(event.currentTarget.value)}
            onBlur={onBlur}
          />
        </Field>
      );

    default:
      return (
        <Field
          label={spec.label}
          required={spec.required}
          help={spec.help}
          error={error}
        >
          <Input
            id={spec.name}
            name={spec.readOnly ? undefined : spec.name}
            type={spec.type ?? "text"}
            inputMode={spec.type === "email" ? "email" : undefined}
            autoComplete={spec.autoComplete}
            autoCapitalize={spec.latin ? "none" : undefined}
            spellCheck={spec.latin ? false : undefined}
            dir={spec.latin ? "ltr" : "auto"}
            placeholder={spec.placeholder}
            minLength={spec.minLength}
            maxLength={spec.maxLength}
            pattern={spec.pattern}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            required={spec.required}
            aria-required={spec.required || undefined}
            readOnly={spec.readOnly}
            value={valueText(value)}
            onChange={(event) => onChange(event.currentTarget.value)}
            onBlur={onBlur}
            // a Latin island on an Arabic page (MDS-TYPE-04), see PasswordField
            lang={spec.latin ? "" : undefined}
          />
        </Field>
      );
  }
}

export interface ProfileFieldsProps {
  fields: ProfileFieldSpec[];
  values: Record<string, ProfileFieldValue>;
  /** the reason to show under each field, by name */
  errors: Record<string, ReactNode>;
  onChange: (name: string, value: ProfileFieldValue) => void;
  onBlur?: (name: string) => void;
  /** drawn just before / after a field, inside its group: the password pair after the user name */
  before?: (spec: ProfileFieldSpec) => ReactNode;
  after?: (spec: ProfileFieldSpec) => ReactNode;
}

/**
 * The provider's fields in the provider's order. Consecutive fields of one
 * group sit under the group's header and description, as Keycloak's own
 * template draws them; a field with no group stands on its own.
 */
export function ProfileFields({
  fields,
  values,
  errors,
  onChange,
  onBlur,
  before,
  after,
}: ProfileFieldsProps) {
  const runs: {
    group?: ProfileFieldSpec["group"];
    fields: ProfileFieldSpec[];
  }[] = [];
  for (const field of fields) {
    const last = runs[runs.length - 1];
    if (last && last.group?.name === field.group?.name) last.fields.push(field);
    else runs.push({ group: field.group, fields: [field] });
  }

  const draw = (spec: ProfileFieldSpec) => (
    <Fragment key={spec.name}>
      {before?.(spec)}
      <ProfileField
        spec={spec}
        value={values[spec.name] ?? ""}
        onChange={(value) => onChange(spec.name, value)}
        onBlur={onBlur ? () => onBlur(spec.name) : undefined}
        error={errors[spec.name]}
      />
      {after?.(spec)}
    </Fragment>
  );

  return (
    <>
      {runs.map((run) =>
        // a run is named by its first field: names are unique in a profile
        run.group ? (
          <ProfileGroup key={run.fields[0]?.name} group={run.group}>
            {run.fields.map(draw)}
          </ProfileGroup>
        ) : (
          <Fragment key={run.fields[0]?.name}>{run.fields.map(draw)}</Fragment>
        )
      )}
    </>
  );
}

function ProfileGroup({
  group,
  children,
}: {
  group: NonNullable<ProfileFieldSpec["group"]>;
  children: ReactNode;
}) {
  const id = `${useId().replace(/[^\w-]/g, "")}-group`;
  return (
    <fieldset
      aria-labelledby={id}
      className="m-0 flex min-inline-0 flex-col gap-5 border-0 p-0"
    >
      <div className="flex flex-col gap-1">
        <h2 className="mds-h4" id={id}>
          {group.header}
        </h2>
        {group.description ? (
          <p className="mds-body-sm">{group.description}</p>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}
