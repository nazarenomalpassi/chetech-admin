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
  const [remoteCustomers, setRemoteCustomers] = useState<RepairAccessCustomerSummary[] | null>(
    null
  );
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
        const response = await fetch(
          `/api/repair-access/customers?q=${encodeURIComponent(search)}`,
          {
            signal: controller.signal
          }
        );
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
    const haystack = [
      customer.fullName,
      customer.phone,
      customer.alternatePhone,
      customer.dni,
      customer.email,
      customer.address
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });
  const emptyMessage = searchError
    ? "Intenta la busqueda nuevamente."
    : isSearching
      ? "Buscando clientes..."
      : "No encontramos clientes con esa busqueda.";

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Clientes</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Últimos 40 clientes. Escribí al menos 2 caracteres para buscar en toda la base.
          </p>
        </div>
        <div className="w-full lg:max-w-sm">
          <label className="grid gap-2 text-sm font-medium text-body">
            <span>Buscar cliente</span>
            <Input
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Nombre, telefono, DNI o email"
              value={search}
            />
          </label>
          {isSearching ? (
            <p className="mt-2 text-xs text-muted-foreground">Buscando en toda la base...</p>
          ) : null}
        </div>
      </div>

      {searchError ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          No se pudo completar la busqueda de clientes. Intenta de nuevo; no se confirmo si hay
          coincidencias.
        </p>
      ) : null}
      <div className="min-w-0">
        <div className="divide-y divide-border lg:hidden">
          {filteredCustomers.length ? (
            filteredCustomers.map((customer) => (
              <article className="min-w-0 py-3 text-sm" key={customer.id}>
                <p className="font-semibold text-foreground">{customer.fullName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {customer.phone || customer.alternatePhone || "-"}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">DNI</span>
                    <p className="mt-1 font-semibold text-body">{customer.dni || "-"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Alta</span>
                    <p className="mt-1 font-semibold text-body">{formatDate(customer.createdAt)}</p>
                  </div>
                </div>
                {customer.email ? (
                  <p className="mt-2 text-sm wrap-break-word text-muted-foreground">
                    {customer.email}
                  </p>
                ) : null}
                {customer.address ? (
                  <p className="mt-1 text-sm leading-5 wrap-break-word text-muted-foreground">
                    {customer.address}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">{customer.source}</p>
              </article>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">DNI</th>
                <th className="px-4 py-3 font-medium">Dirección</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length ? (
                filteredCustomers.map((customer) => (
                  <tr className="border-t border-border" key={customer.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{customer.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {customer.email || "Sin email"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {customer.phone || customer.alternatePhone || "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.dni || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.address || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.source}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(customer.createdAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
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
