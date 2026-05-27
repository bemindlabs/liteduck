import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const selectVariants = cva(
  [
    "w-full appearance-none rounded-md border border-[var(--color-input)] bg-[var(--color-background)] text-[var(--color-foreground)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "cursor-pointer",
  ].join(" "),
  {
    variants: {
      size: {
        default: "px-3 py-1.5 pr-8 text-sm",
        sm: "px-2 py-1 pr-7 text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

// ── Select ───────────────────────────────────────────────────────────────────

export interface SelectProps
  extends
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select ref={ref} className={cn(selectVariants({ size, className }))} {...props}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
      </div>
    );
  },
);
Select.displayName = "Select";

// eslint-disable-next-line react-refresh/only-export-components
export { Select, selectVariants };
