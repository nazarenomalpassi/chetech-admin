function LoadingCard() {
  return <div className="h-32 animate-pulse rounded-[30px] border border-graphite/10 bg-white/70" />;
}

export default function ReportesLoading() {
  return (
    <div className="space-y-6">
      <div className="h-36 animate-pulse rounded-[30px] border border-graphite/10 bg-white/70" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <LoadingCard key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <div className="h-[420px] animate-pulse rounded-[30px] border border-graphite/10 bg-white/70" />
        <div className="h-[420px] animate-pulse rounded-[30px] border border-graphite/10 bg-white/70" />
        <div className="h-[420px] animate-pulse rounded-[30px] border border-graphite/10 bg-white/70" />
      </div>
      <div className="h-[360px] animate-pulse rounded-[30px] border border-graphite/10 bg-white/70" />
    </div>
  );
}
