import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex max-w-full items-center rounded-md px-2.5 py-1 text-xs font-medium leading-5", {
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
