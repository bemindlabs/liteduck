import { cn } from "@/lib/utils";

interface LiteDuckLogoProps {
  className?: string;
  alt?: string;
  decorative?: boolean;
}

export function LiteDuckLogo({
  className,
  alt = "LiteDuck logo",
  decorative = false,
}: LiteDuckLogoProps) {
  return (
    <img
      src="/liteduck.svg"
      alt={decorative ? "" : alt}
      aria-hidden={decorative}
      draggable={false}
      className={cn("select-none object-contain", className)}
    />
  );
}
