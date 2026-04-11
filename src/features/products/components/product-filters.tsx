"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function ProductFilters({
  categories
}: {
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.push(`/productos?${params.toString()}`);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-10"
          defaultValue={searchParams.get("search") ?? ""}
          onChange={(event) => updateParam("search", event.target.value)}
          placeholder="Buscar por nombre o SKU"
        />
      </div>
      <Select
        defaultValue={searchParams.get("category") ?? "all"}
        onChange={(event) => updateParam("category", event.target.value)}
        options={[
          { label: "Todas las categorías", value: "all" },
          ...categories.map((category) => ({ label: category.name, value: category.id }))
        ]}
      />
      <Select
        defaultValue={searchParams.get("status") ?? "all"}
        onChange={(event) => updateParam("status", event.target.value)}
        options={[
          { label: "Todos", value: "all" },
          { label: "Activos", value: "active" },
          { label: "Inactivos", value: "inactive" }
        ]}
      />
    </div>
  );
}
