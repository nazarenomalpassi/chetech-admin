"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function DialogShell({
  children,
  labelledBy,
  onClose,
  panelClassName
}: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  panelClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const panel = panelRef.current;
    document.body.style.overflow = "hidden";

    const focusableElements = panel ? Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)) : [];
    (focusableElements[0] ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) return;

      const currentFocusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (!currentFocusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-3 py-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={cn(
          "max-h-[calc(100svh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full overflow-y-auto overscroll-contain rounded-xl border border-line bg-white p-4 shadow-pop sm:rounded-2xl sm:p-6",
          panelClassName
        )}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
