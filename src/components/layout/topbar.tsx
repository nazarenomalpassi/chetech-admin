import { CalendarRange, ShieldCheck } from "lucide-react";

function getArgentinaDateLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date());
}

export function Topbar() {
  const dateLabel = getArgentinaDateLabel();

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-graphite/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,248,244,0.94))] p-4 shadow-panel sm:rounded-[34px] lg:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29,29,27,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.64),transparent_30%)]" />
      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-graphite/10 bg-graphite shadow-[0_14px_28px_rgba(20,20,19,0.18)] sm:h-12 sm:w-12 sm:rounded-[20px]">
              <img alt="" className="h-7 w-7" src="/brand/chetech-isologo-white.svg" />
            </div>
            <div>
              <p className="panel-kicker flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Operación diaria
              </p>
              <p className="font-brand mt-1 text-[1.6rem] tracking-[-0.05em] text-graphite sm:text-[2rem]">Chetech</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:justify-end">
            <div className="whitespace-nowrap rounded-[18px] border border-graphite/10 bg-white/85 px-3.5 py-2 text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-xl bg-brand-100 text-graphite">
                <CalendarRange className="h-4 w-4" />
              </span>
              {dateLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
