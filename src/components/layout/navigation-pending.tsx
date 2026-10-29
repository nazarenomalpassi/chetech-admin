"use client";

import { useLinkStatus } from "next/link";

export function NavigationPending({ label }: { label: string }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span className="nav-link-activity" data-pending={pending} aria-hidden="true" />
      <span className="sr-only" role="status" aria-atomic="true">
        {pending ? `Abriendo ${label}` : ""}
      </span>
    </>
  );
}
