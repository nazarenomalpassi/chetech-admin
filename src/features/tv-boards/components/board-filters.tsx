"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TV_BOARD_TYPES } from "@/features/tv-boards/schemas";

export function BoardFilters() {
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
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [search, updateParam]);

  return (
    <div className="table-toolbar">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-10"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por marca, modelo o texto"
          value={search}
        />
      </div>

      <div className="relative">
        <LayoutGrid className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Select
          className="pl-10"
          defaultValue={searchParams.get("boardType") ?? "all"}
          onChange={(event) => updateParam("boardType", event.target.value)}
          options={[
            { label: "Todos los tipos", value: "all" },
            ...TV_BOARD_TYPES.map((type) => ({ label: type.label, value: type.value }))
          ]}
        />
      </div>

      <Select
        defaultValue={searchParams.get("status") ?? "all"}
        onChange={(event) => updateParam("status", event.target.value)}
        options={[
          { label: "Todas las placas", value: "all" },
          { label: "Disponibles", value: "active" },
          { label: "Dadas de baja", value: "inactive" },
          { label: "Vendidas", value: "sold" },
          { label: "En espera de liberacion", value: "pending_release" },
          { label: "Dinero liberado", value: "released" }
        ]}
      />
    </div>
  );
}
