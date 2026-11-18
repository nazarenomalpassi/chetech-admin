"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TV_BOARD_TYPES } from "@/features/tv-boards/schemas";

const SEARCH_DELAY_MS = 350;

export function BoardFilters({
  brands = [],
  placeholder = "Modelo, marca o número de caja"
}: {
  placeholder?: string;
  /** Marcas cargadas (valor normalizado y nombre para mostrar). */
  brands?: Array<{ value: string; label: string }>;
}) {
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
    }, SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [search, updateParam]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      <div className="col-span-2 space-y-1 text-sm font-medium text-body md:col-span-1">
        <label className="block" htmlFor={`${id}-search`}>
          Buscar placa
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar placas"
            autoComplete="off"
            className="pr-10 pl-9"
            id={`${id}-search`}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            type="search"
            value={search}
          />
          {search ? (
            <button
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setSearch("")}
              type="button"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1 text-sm font-medium text-body">
        <label className="block" htmlFor={`${id}-brand`}>
          Marca
        </label>
        <Select
          aria-label="Filtrar placas por marca"
          id={`${id}-brand`}
          defaultValue={searchParams.get("brand") ?? "all"}
          onChange={(event) => updateParam("brand", event.target.value)}
          options={[{ label: "Todas las marcas", value: "all" }, ...brands]}
        />
      </div>

      <div className="space-y-1 text-sm font-medium text-body">
        <label className="block" htmlFor={`${id}-type`}>
          Tipo de placa
        </label>
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

      <div className="col-span-2 space-y-1 text-sm font-medium text-body md:col-span-1">
        <label className="block" htmlFor={`${id}-status`}>
          Estado
        </label>
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
            { label: "Liberación sin confirmar", value: "pending_release" },
            { label: "Reclamo abierto / dinero retenido", value: "claim_open" },
            { label: "Venta anulada", value: "cancelled" },
            { label: "Liberación confirmada", value: "released" }
          ]}
        />
      </div>
    </div>
  );
}
