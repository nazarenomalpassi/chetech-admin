"use client";

import { useDeferredValue, useState, type SelectHTMLAttributes } from "react";

import { Input } from "./input";
import { Select, type SelectOption } from "./select";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "defaultValue" | "value"> & {
  options: SelectOption[];
  value: string;
  searchLabel: string;
};

function searchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
}

export function SearchableSelect({ options, searchLabel, value, ...props }: Props) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(searchText(search.trim()));
  const matches = options.filter((option) => !option.value || option.value === value || searchText(option.label).includes(query));
  const matchCount = matches.filter((option) => option.value && searchText(option.label).includes(query)).length;

  return <div className="grid min-w-0 gap-2">
    <Input type="search" aria-label={searchLabel} autoComplete="off" placeholder={searchLabel} value={search} disabled={props.disabled} onChange={(event) => setSearch(event.target.value)} />
    <Select {...props} value={value} options={matches} />
    {search ? <p className="text-xs text-slate-600" role="status">{matchCount ? `${matchCount} coincidencias` : "Sin coincidencias. Cambiá la búsqueda."}</p> : null}
  </div>;
}
