import { Input } from "@medaris/ui/components/input";
import { Skeleton } from "@medaris/ui/components/skeleton";
import { cn } from "@medaris/ui/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type React from "react";

export const EditableInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  isLoading?: boolean;
}> = ({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  className,
  isLoading,
}) => {
  if (isLoading) {
    return <Skeleton className={cn("h-8 w-full", className)} />;
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "border border-transparent shadow-none focus-visible:ring-0 p-1 hover:border hover:border-gray-200",
        className
      )}
    />
  );
};

export function createInputColumn<TData>(
  accessorKey: keyof TData,
  columnDef: ColumnDef<TData>,
  options?: {
    placeholder?: string;
    disabled?: boolean;
    className?: string;
  }
): ColumnDef<TData> {
  return {
    accessorKey: accessorKey as string,
    ...columnDef,
    meta: {
      inputType: "input",
      ...options,
    },
  };
}
