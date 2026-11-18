import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-4 sm:rounded-2xl sm:p-5",
        className
      )}
      {...props}
    />
  );
}
