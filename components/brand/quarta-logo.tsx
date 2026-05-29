import { cn } from "@/lib/utils"

/**
 * Quarta bird/arrow icon — traced from brand logo.
 * A stylized bird in flight, angular geometric wings.
 */
export function QuartaIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      {...props}
    >
      {/* Bird body — angular arrow/bird shape */}
      <path
        d="M4 18L16 14L28 6L18 16L16 14L14 18L4 18Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Upper wing */}
      <path
        d="M14 8L20 4L28 6L16 14L14 8Z"
        fill="currentColor"
      />
      {/* Lower wing / tail */}
      <path
        d="M4 18L14 18L18 16L28 6L20 18L16 22L4 18Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  )
}

/**
 * Full Quarta wordmark: bird icon + "quarta" text
 */
export function QuartaWordmark({
  className,
  iconClassName,
  showSubtitle = false,
}: {
  className?: string
  iconClassName?: string
  showSubtitle?: boolean
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <QuartaIcon className={cn("h-7 w-7 text-[var(--quarta-blue)]", iconClassName)} />
      <div className="min-w-0">
        <span className="font-semibold text-sm tracking-tight">quarta</span>
        {showSubtitle && (
          <p className="text-[9px] text-muted-foreground/60 leading-tight -mt-0.5">
            acompanamiento legal
          </p>
        )}
      </div>
    </div>
  )
}
