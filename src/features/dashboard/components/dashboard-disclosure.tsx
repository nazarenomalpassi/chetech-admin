import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";

export function DashboardDisclosure({
  title,
  summary,
  children
}: {
  title: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="self-start overflow-hidden p-0 sm:p-0">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground tabular-nums">{summary}</p>
          </div>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="border-t border-border p-4 sm:p-5">{children}</div>
      </details>
    </Card>
  );
}
