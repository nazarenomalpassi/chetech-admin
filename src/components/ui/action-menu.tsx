"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ActionMenu({ children, label = "Más acciones" }: { children: ReactNode; label?: string }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!position) {
      if (wasOpenRef.current && document.activeElement === document.body) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    panelRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)")?.focus();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setPosition(null);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPosition(null);
        triggerRef.current?.focus();
      }
    };
    const closeScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) setPosition(null);
    };
    const closeResize = () => setPosition(null);
    const closeFocus = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setPosition(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    document.addEventListener("scroll", closeScroll, true);
    document.addEventListener("focusin", closeFocus);
    window.addEventListener("resize", closeResize);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
      document.removeEventListener("scroll", closeScroll, true);
      document.removeEventListener("focusin", closeFocus);
      window.removeEventListener("resize", closeResize);
    };
  }, [position]);

  function toggle() {
    if (position) { setPosition(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)),
      top: rect.bottom + 8 + 240 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 248)
    });
  }

  return <>
    <Button aria-controls={position ? id : undefined} aria-expanded={Boolean(position)} aria-label={label} ref={triggerRef} onClick={toggle} size="sm" type="button" variant="ghost">
      <MoreHorizontal aria-hidden="true" className="h-4 w-4" /><span>{label}</span>
    </Button>
    {position ? createPortal(<div className="fixed z-[70] grid w-56 gap-1 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-pop [&_button]:w-full [&_button]:justify-start [&_form]:w-full" id={id} role="group" aria-label={label} ref={panelRef} style={{ ...position, maxHeight: Math.min(240, window.innerHeight - position.top - 8) }}
      onClick={(event) => {
        const control = (event.target as HTMLElement).closest("button,a");
        // Keep native forms mounted until their submit event has reached React.
        if (control && !control.closest("form")) setPosition(null);
      }}>
      {children}
    </div>, document.body) : null}
  </>;
}
