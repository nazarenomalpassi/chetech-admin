import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, id, name, ...props }, ref) => (
    <input
      ref={ref}
      id={id ?? name}
      name={name}
      className={cn(
        "flex h-11 min-w-0 w-full rounded-lg border border-[var(--control-line)] bg-white px-3 py-2 text-base text-graphite outline-none transition-colors duration-150 placeholder:text-slate-500 focus:border-graphite focus:ring-2 focus:ring-graphite/15 disabled:cursor-not-allowed disabled:border-line disabled:bg-brand-50 disabled:text-slate-500 read-only:bg-brand-50 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-200 sm:text-sm",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";
