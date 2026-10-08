import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-line bg-white p-4 sm:rounded-2xl sm:p-5",
        className
      )}
      {...props}
    />
  );
}
