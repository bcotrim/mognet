import { MessageCircleIcon } from "lucide-react";

import { cn } from "~/lib/utils";

export function InlineCommentCountBadge({
  count,
  label,
  className,
}: {
  count: number;
  label?: string;
  className?: string;
}) {
  if (count <= 0) return null;
  const title = label ?? `${count} inline comment${count === 1 ? "" : "s"}`;

  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-cyan-500/30 bg-cyan-500/10 px-1 text-[10px] leading-none font-medium text-cyan-700 tabular-nums dark:text-cyan-300",
        className,
      )}
      aria-label={title}
      title={title}
    >
      <MessageCircleIcon aria-hidden="true" className="size-3" />
      <span>{count}</span>
    </span>
  );
}
