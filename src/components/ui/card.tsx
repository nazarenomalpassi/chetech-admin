import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-graphite/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(250,250,246,0.98))] p-4 shadow-panel before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.55),transparent_34%)] sm:rounded-[30px] sm:p-6 [&>*]:relative [&>*]:z-[1]",
        className
      )}
      {...props}
    />
  );
}
