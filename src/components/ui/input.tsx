import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-[18px] border border-graphite/12 bg-[rgba(255,255,255,0.88)] px-4 py-2 text-sm text-graphite shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] outline-none transition duration-200 placeholder:text-fog/90 focus:border-graphite/30 focus:bg-white focus:ring-4 focus:ring-graphite/6",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";
