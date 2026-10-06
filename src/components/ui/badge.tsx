import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex rounded-full px-3 py-1 text-[0.72rem] font-semibold tracking-[0.12em] uppercase", {
  variants: {
    variant: {
      default: "border border-graphite/10 bg-brand-100 text-brand-700",
      success: "border border-emerald-200 bg-finance-profitSoft text-finance-profit",
      warning: "border border-amber-200 bg-finance-cautionSoft text-finance-caution",
      danger: "border border-rose-200 bg-finance-expenseSoft text-finance-expense"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
