import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[18px] text-sm font-semibold tracking-[-0.01em] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/20 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-graphite text-white shadow-[0_18px_34px_rgba(20,20,19,0.16)] hover:-translate-y-0.5 hover:bg-black",
        secondary:
          "border border-graphite/10 bg-white/90 text-graphite shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:bg-brand-50 hover:text-graphite",
        ghost: "bg-transparent text-slate-600 hover:bg-brand-100 hover:text-graphite",
        danger: "bg-rose-600 text-white shadow-[0_16px_30px_rgba(190,45,45,0.18)] hover:-translate-y-0.5 hover:bg-rose-700"
      },
      size: {
        default: "h-11 px-4 py-2.5",
        sm: "h-9 rounded-2xl px-3 text-[0.82rem]",
        lg: "h-12 px-6 text-[0.95rem]"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
