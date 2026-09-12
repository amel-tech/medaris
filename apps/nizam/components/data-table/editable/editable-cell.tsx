import type { CellContext, RowData } from "@tanstack/react-table";
import type {
  LegacyColumnDef as ColumnDef,
  LegacyFeatures,
} from "@tanstack/react-table/legacy";
import React from "react";

import { EditableInput } from "./editable-input";
import { EditableSelect } from "./editable-select";
import { EditableSwitch } from "./editable-switch";
import { EditableTextarea } from "./editable-textarea";

export function EditableCell<TData extends RowData>(
  props: CellContext<LegacyFeatures, TData, unknown>
) {
  const {
    getValue,
    row: { index },
    column: { id },
    table,
    column: { columnDef },
  } = props;
  const [initialValue, setInitialValue] = React.useState(getValue());
  const [value, setValue] = React.useState(initialValue);

  // Get column configuration
  const meta = columnDef.meta;
  const inputType = meta?.inputType || "input";
  const options = meta?.options || [];
  const optionsProvider = meta?.optionsProvider;
  const placeholder = meta?.placeholder;
  const disabled = meta?.disabled;
  const className = meta?.className;

  // Check if this cell is currently loading
  const cellId = `${index}-${id}`;
  const isLoading = table.options.meta?.loadingCells?.has(cellId) || false;

  // Get dynamic options if provider is available
  const dynamicOptions = optionsProvider
    ? optionsProvider(table.options.data || [], index)
    : options;

  // `ColumnMeta.options` admits `string | boolean` values (the switch column
  // needs the boolean), while the Radix `Select` compares item values as
  // strings. Coerced once per options array rather than on every render —
  // this cell re-renders on each keystroke and whenever `loadingCells`
  // changes. `dynamicOptions` is a stable reference when it comes from
  // `meta.options`; a provider rebuilds it each render, in which case the
  // memo is a no-op rather than a cost.
  const selectOptions = React.useMemo(
    () =>
      dynamicOptions.map(({ value, label }) => ({
        value: String(value),
        label,
      })),
    [dynamicOptions]
  );

  // When the input is blurred, we'll call our table meta's updateData function
  const handleSave = () => {
    // Only trigger update if the value has actually changed
    if (value !== initialValue) {
      table.options.meta?.updateData(index, id, value);
      setInitialValue(value);
    }
  };

  // If the initialValue is changed externally, sync it up with our state
  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleChange = (newValue: string | boolean) => {
    setValue(newValue);
  };

  // Render different input types based on configuration
  switch (inputType) {
    case "select":
      return (
        <EditableSelect
          // Both sides of the Select must agree on the string form: an item
          // rendered as "true" never matches a raw boolean `true` and the
          // control shows its placeholder for a cell that has a value.
          value={typeof value === "boolean" ? String(value) : (value as string)}
          onChange={handleChange}
          onBlur={handleSave}
          options={selectOptions}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          className={className}
          isLoading={isLoading}
        />
      );
    case "textarea":
      return (
        <EditableTextarea
          value={value as string}
          onChange={handleChange}
          onBlur={handleSave}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          className={className}
          isLoading={isLoading}
        />
      );
    case "switch":
      return (
        <EditableSwitch
          value={value as boolean}
          onChange={handleChange}
          onBlur={handleSave}
          disabled={disabled || isLoading}
          className={className}
          isLoading={isLoading}
        />
      );
    default:
      return (
        <EditableInput
          value={value as string}
          onChange={handleChange}
          onBlur={handleSave}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          className={className}
          isLoading={isLoading}
        />
      );
  }
}

export function createDefaultColumn<TData extends RowData>(): Partial<
  ColumnDef<TData>
> {
  return {
    cell: (props) => <EditableCell {...props} />,
  };
}
