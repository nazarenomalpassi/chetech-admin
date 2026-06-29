"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers3, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function ProductFilters({
  categories
}: {
  categories: { id: string; name: string }[];
}) {
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

      router.replace(query ? `/productos?${query}` : "/productos");
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
    <div className="table-toolbar">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-10"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, SKU o palabra clave"
          value={search}
        />
      </div>

      <div className="relative">
        <Layers3 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Select
          className="pl-10"
          defaultValue={searchParams.get("category") ?? "all"}
          onChange={(event) => updateParam("category", event.target.value)}
          options={[
            { label: "Todas las categorias", value: "all" },
            ...categories.map((category) => ({ label: category.name, value: category.id }))
          ]}
        />
      </div>

      <Select
        defaultValue={searchParams.get("status") ?? "all"}
        onChange={(event) => updateParam("status", event.target.value)}
        options={[
          { label: "Todos los estados", value: "all" },
          { label: "Solo activos", value: "active" },
          { label: "Solo inactivos", value: "inactive" }
        ]}
      />
    </div>
  );
}
