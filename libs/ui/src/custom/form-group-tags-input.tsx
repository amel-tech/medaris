import React from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import { Label } from "../components/label";
import { cn } from "../lib/utils";
import { FormField, FormItem } from "./form";
import { TagsInput, type TagsInputProps } from "./tags-input";

interface IATFormGroupTagsInputProps<T extends FieldValues = FieldValues>
  extends Omit<TagsInputProps, "id" | "value" | "onChange" | "name"> {
  name: Path<T>;
  label?: string;
  wrapperClass?: string;
  description?: string;
  required?: boolean;
  control: Control<T>;
}

function ATFormGroupTagsInput<T extends FieldValues = FieldValues>({
  name,
  label,
  wrapperClass = "mb-4",
  description,
  required,
  control,
  className,
  ...props
}: IATFormGroupTagsInputProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <FormItem className={cn(wrapperClass)}>
          {label && (
            <Label htmlFor={name as string} className="mb-3">
              {label}
              {required && <span className="text-red-500">*</span>}
            </Label>
          )}

          {description && (
            <p className="text-sm text-muted-foreground mb-2">{description}</p>
          )}

          <TagsInput
            id={name}
            value={field.value || []}
            onChange={field.onChange}
            className={cn(
              error && "border-red-500 focus-within:border-red-500",
              className
            )}
            variant={error ? "destructive" : "default"}
            {...props}
          />

          {error && (
            <small className="text-red-500 text-xs">{error.message}</small>
          )}
        </FormItem>
      )}
    />
  );
}

export default ATFormGroupTagsInput;
export type { IATFormGroupTagsInputProps };
