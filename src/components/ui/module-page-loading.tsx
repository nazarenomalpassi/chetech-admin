function LoadingTile({ className = "h-32" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[30px] border border-graphite/10 bg-white/70 ${className}`} />;
}

export function ModulePageLoading({
  statCount = 3,
  showTable = true
}: {
  statCount?: number;
  showTable?: boolean;
}) {
  return (
    <div className="space-y-4">
      <LoadingTile className="h-44" />
      <div className={`grid gap-4 ${statCount >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {Array.from({ length: statCount }).map((_, index) => (
          <LoadingTile className="h-28" key={index} />
        ))}
      </div>
      {showTable ? <LoadingTile className="h-[520px]" /> : null}
    </div>
  );
}
