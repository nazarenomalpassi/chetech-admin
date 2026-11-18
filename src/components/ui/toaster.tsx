"use client";

import { Toaster as Sonner } from "sonner";

export { toast } from "sonner";

/** Avisos flotantes: confirman una acción sin recargar ni perder la posición. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      mobileOffset={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl! border! border-border! bg-card! text-foreground! shadow-pop! font-sans!",
          description: "text-muted-foreground!",
          success: "[&_[data-icon]]:text-success!",
          error: "[&_[data-icon]]:text-danger!",
          warning: "[&_[data-icon]]:text-warning!",
          actionButton: "bg-primary! text-primary-foreground!",
          cancelButton: "bg-accent! text-foreground!"
        }
      }}
    />
  );
}
