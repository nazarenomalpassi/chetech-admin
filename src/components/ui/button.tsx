import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-graphite bg-graphite text-white hover:bg-black",
        secondary:
          "border border-line bg-white text-graphite hover:border-brand-300 hover:bg-brand-50",
        ghost: "bg-transparent text-slate-600 hover:bg-brand-100 hover:text-graphite",
        danger: "border border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50"
      },
      size: {
        default: "px-4 py-2.5",
        sm: "min-h-11 px-3 py-2 text-sm sm:min-h-9",
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
