"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { RepairAccessCustomerSummary } from "@/features/repairs-access/queries";
import { formatDate } from "@/lib/utils";

export function RepairAccessCustomersSection({
  customers,
  search,
  onSearchChange
}: {
  customers: RepairAccessCustomerSummary[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const [remoteCustomers, setRemoteCustomers] = useState<RepairAccessCustomerSummary[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    setSearchError(false);
    setRemoteCustomers(null);
    if (normalizedSearch.length < 2) {
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/repair-access/customers?q=${encodeURIComponent(search)}`, {
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Customer search failed");
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!Array.isArray(payload.customers)) throw new Error("Invalid customer response");
        setRemoteCustomers(payload.customers ?? []);
      } catch {
        if (!controller.signal.aborted) setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [normalizedSearch, search]);

  const sourceCustomers = remoteCustomers ?? customers;
  const filteredCustomers = sourceCustomers.filter((customer) => {
    if (!normalizedSearch) return true;
    const haystack = [customer.fullName, customer.phone, customer.alternatePhone, customer.dni, customer.email, customer.address]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });
  const emptyMessage = searchError ? "Intenta la busqueda nuevamente." : isSearching ? "Buscando clientes..." : "No encontramos clientes con esa busqueda.";

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Clientes</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Ultimos 40 clientes. Escribi al menos 2 caracteres para buscar en toda la base.
          </p>
        </div>
        <div className="w-full lg:max-w-sm">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>Buscar cliente</span>
            <Input onChange={(event) => onSearchChange(event.target.value)} placeholder="Nombre, telefono, DNI o email" value={search} />
          </label>
          {isSearching ? <p className="mt-2 text-xs text-slate-500">Buscando en toda la base...</p> : null}
        </div>
      </div>

      {searchError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">No se pudo completar la busqueda de clientes. Intenta de nuevo; no se confirmo si hay coincidencias.</p> : null}
      <div className="min-w-0">
        <div className="divide-y divide-slate-200 lg:hidden">
          {filteredCustomers.length ? (
            filteredCustomers.map((customer) => (
              <article className="min-w-0 py-3 text-sm" key={customer.id}>
                <p className="font-semibold text-slate-950">{customer.fullName}</p>
                <p className="mt-1 text-sm text-slate-600">{customer.phone || customer.alternatePhone || "-"}</p>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">DNI</span>
                    <p className="mt-1 font-semibold text-slate-700">{customer.dni || "-"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Alta</span>
                    <p className="mt-1 font-semibold text-slate-700">{formatDate(customer.createdAt)}</p>
                  </div>
                </div>
                {customer.email ? <p className="mt-2 break-words text-sm text-slate-500">{customer.email}</p> : null}
                {customer.address ? <p className="mt-1 break-words text-sm leading-5 text-slate-500">{customer.address}</p> : null}
                <p className="mt-2 text-xs text-slate-500">{customer.source}</p>
              </article>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {emptyMessage}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Telefono</th>
                <th className="px-4 py-3 font-medium">DNI</th>
                <th className="px-4 py-3 font-medium">Direccion</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length ? (
                filteredCustomers.map((customer) => (
                  <tr className="border-t border-slate-100" key={customer.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-950">{customer.fullName}</p>
                      <p className="text-xs text-slate-500">{customer.email || "Sin email"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{customer.phone || customer.alternatePhone || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.dni || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.address || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.source}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(customer.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
