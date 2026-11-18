import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, id, name, ...props }, ref) => (
  <textarea
    ref={ref}
    id={id ?? name}
    name={name}
    className={cn(
      "min-h-24 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2.5 text-base leading-6 text-foreground shadow-[var(--shadow-panel)] outline-hidden transition-colors duration-150 placeholder:text-subtle-foreground read-only:bg-muted focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted aria-invalid:border-danger sm:text-sm",
      className
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
