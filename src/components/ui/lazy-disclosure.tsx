"use client";

import { useState, type ReactNode } from "react";

export function LazyDisclosure({ children, summary, className, summaryClassName }: {
  children: ReactNode;
  summary: ReactNode;
  className?: string;
  summaryClassName?: string;
}) {
  const [hasOpened, setHasOpened] = useState(false);
  return (
    <details className={className} onToggle={(event) => {
      if (event.currentTarget.open) setHasOpened(true);
    }}>
      <summary className={summaryClassName}>{summary}</summary>
      {hasOpened ? children : null}
    </details>
  );
}
