import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export function Topbar() {
  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-soft backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-brand-700">Operación diaria</p>
        <h2 className="text-2xl font-semibold text-slate-900">Chetech</h2>
      </div>
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-10" placeholder="Buscar módulo, venta o producto..." />
      </div>
    </div>
  );
}
