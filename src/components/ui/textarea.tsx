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
      "min-h-24 w-full min-w-0 rounded-lg border border-[var(--control-line)] bg-white px-3 py-2.5 text-base leading-6 text-graphite outline-none transition-colors duration-150 placeholder:text-slate-500 read-only:bg-brand-50 focus:border-graphite focus:ring-2 focus:ring-graphite/15 disabled:cursor-not-allowed disabled:border-line disabled:bg-brand-50 aria-[invalid=true]:border-rose-500 sm:text-sm",
      className
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
