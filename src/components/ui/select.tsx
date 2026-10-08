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
        "flex h-11 min-w-0 w-full rounded-lg border border-[var(--control-line)] bg-white px-3 py-2 text-base text-graphite outline-none transition-colors duration-150 focus:border-graphite focus:ring-2 focus:ring-graphite/15 disabled:cursor-not-allowed disabled:border-line disabled:bg-brand-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-500 sm:text-sm",
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
