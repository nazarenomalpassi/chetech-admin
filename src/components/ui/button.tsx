import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Jerarquía de botones:
 * - default: la acción principal de la vista. Uno solo por pantalla o panel.
 * - secondary: acciones alternativas del mismo nivel.
 * - ghost: acciones de bajo peso y navegación.
 * - danger: anular o descartar; siempre con confirmación.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-primary-hover",
        secondary:
          "border border-border-strong bg-card text-foreground shadow-[var(--shadow-panel)] hover:bg-accent",
        ghost: "bg-transparent text-body hover:bg-accent hover:text-foreground",
        danger: "border border-danger-border bg-card text-danger hover:bg-danger-soft"
      },
      size: {
        default: "min-h-11 px-4 py-2.5",
        sm: "min-h-11 px-3 py-2 sm:min-h-9",
        lg: "min-h-12 px-6 text-base",
        icon: "size-11 sm:size-9"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Muestra un indicador de carga y deshabilita el botón. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        ref={ref}
        {...props}
      >
        {loading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
