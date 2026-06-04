import { CalendarRange, Search, ShieldCheck } from "lucide-react";

import { Input } from "@/components/ui/input";

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
    <div className="relative overflow-hidden rounded-[34px] border border-graphite/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,248,244,0.94))] p-5 shadow-panel lg:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29,29,27,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.64),transparent_30%)]" />
      <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between xl:flex-1">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-graphite/10 bg-graphite shadow-[0_14px_28px_rgba(20,20,19,0.18)]">
              <img alt="" className="h-7 w-7" src="/brand/chetech-isologo-white.svg" />
            </div>
            <div>
              <p className="panel-kicker flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Operacion diaria
              </p>
              <h2 className="font-brand mt-1 text-[2rem] tracking-[-0.05em] text-graphite">Chetech</h2>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:justify-end">
            <div className="rounded-[18px] border border-graphite/10 bg-white/85 px-3.5 py-2 text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-xl bg-brand-100 text-graphite">
                <CalendarRange className="h-4 w-4" />
              </span>
              {dateLabel}
            </div>
          </div>
        </div>

        <div className="relative w-full xl:max-w-[30rem]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite/42" />
          <Input
            className="h-12 rounded-[20px] border-graphite/10 bg-white/90 pl-11 shadow-[0_10px_25px_rgba(20,20,19,0.05)]"
            placeholder="Buscar modulo, venta o producto..."
          />
        </div>
      </div>
    </div>
  );
}
