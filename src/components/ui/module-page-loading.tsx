function LoadingTile({ className = "h-32" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl border border-line bg-white ${className}`} />;
}

export function ModulePageLoading({
  statCount = 3,
  showTable = true
}: {
  statCount?: number;
  showTable?: boolean;
}) {
  return (
    <div aria-busy="true" aria-label="Cargando sección" role="status" className="space-y-4">
      <span className="sr-only">Cargando información…</span>
      <LoadingTile className="h-24" />
      <div className={`grid gap-4 ${statCount >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {Array.from({ length: statCount }).map((_, index) => (
          <LoadingTile className="h-28" key={index} />
        ))}
      </div>
      {showTable ? <LoadingTile className="h-[520px]" /> : null}
    </div>
  );
}
