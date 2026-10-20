"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TV_BOARD_TYPES } from "@/features/tv-boards/schemas";

export function BoardFilters() {
  const id = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const previousQuery = params.toString();

      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }

      const query = params.toString();
      if (query === previousQuery) return;

      router.replace((query ? `/placas-tv?${query}` : "/placas-tv") as Route);
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      updateParam("search", search.trim());
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [search, updateParam]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-1 text-sm font-medium text-slate-700">
        <label className="block" htmlFor={`${id}-search`}>Buscar placas</label>
        <Input
          aria-label="Buscar placas"
          id={`${id}-search`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Marca o modelo"
          value={search}
        />
      </div>

      <div className="space-y-1 text-sm font-medium text-slate-700">
        <label className="block" htmlFor={`${id}-type`}>Tipo de placa</label>
        <Select
          aria-label="Filtrar placas por tipo"
          id={`${id}-type`}
          defaultValue={searchParams.get("boardType") ?? "all"}
          onChange={(event) => updateParam("boardType", event.target.value)}
          options={[
            { label: "Todos los tipos", value: "all" },
            ...TV_BOARD_TYPES.map((type) => ({ label: type.label, value: type.value }))
          ]}
        />
      </div>

      <div className="space-y-1 text-sm font-medium text-slate-700">
      <label className="block" htmlFor={`${id}-status`}>Estado</label>
      <Select
        aria-label="Filtrar placas por estado"
        id={`${id}-status`}
        defaultValue={searchParams.get("status") ?? "all"}
        onChange={(event) => updateParam("status", event.target.value)}
        options={[
          { label: "Todas las placas", value: "all" },
          { label: "Disponibles", value: "active" },
          { label: "Dadas de baja", value: "inactive" },
          { label: "Vendidas", value: "sold" },
          { label: "Liberacion sin confirmar", value: "pending_release" },
          { label: "Reclamo abierto / dinero retenido", value: "claim_open" },
          { label: "Venta anulada", value: "cancelled" },
          { label: "Liberacion confirmada", value: "released" }
        ]}
      />
      </div>
    </div>
  );
}
