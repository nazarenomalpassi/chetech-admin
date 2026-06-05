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
  ({ className, options, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-[18px] border border-graphite/12 bg-[rgba(255,255,255,0.88)] px-4 py-2 text-base text-graphite shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition duration-200 focus:border-graphite/30 focus:bg-white focus:ring-4 focus:ring-graphite/6 sm:h-11 sm:text-sm",
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
