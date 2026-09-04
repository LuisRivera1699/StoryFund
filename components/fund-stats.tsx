import { formatUsdLike } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function FundStats({
  totalBudget,
  funded,
  locked,
  released,
  className,
}: {
  totalBudget: bigint;
  funded: bigint;
  locked: bigint;
  released: bigint;
  className?: string;
}) {
  const remaining = totalBudget > funded ? totalBudget - funded : 0n;
  const items = [
    { label: "Total project", value: formatUsdLike(totalBudget) },
    { label: "Funded", value: formatUsdLike(funded) },
    { label: "Locked", value: formatUsdLike(locked) },
    { label: "Released", value: formatUsdLike(released) },
    { label: "Remaining", value: formatUsdLike(remaining) },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-5", className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border/70 bg-white/60 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
