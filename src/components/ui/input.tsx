import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, id, name, ...props }, ref) => (
  <input
    ref={ref}
    id={id ?? name}
    name={name}
    className={cn(
      "flex h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-[var(--shadow-panel)] outline-hidden transition-colors duration-150 placeholder:text-subtle-foreground read-only:bg-muted focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-danger aria-invalid:focus:ring-danger/20 sm:h-10 sm:text-sm",
      className
    )}
    {...props}
  />
));

Input.displayName = "Input";
