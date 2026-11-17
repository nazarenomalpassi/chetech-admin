import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectOption = {
  label: string;
  value: string;
};

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[];
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, id, name, options, ...props }, ref) => (
    <select
      ref={ref}
      id={id ?? name}
      name={name}
      className={cn(
        "flex h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground outline-hidden transition-colors duration-150 focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-danger sm:text-sm",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
);

Select.displayName = "Select";
