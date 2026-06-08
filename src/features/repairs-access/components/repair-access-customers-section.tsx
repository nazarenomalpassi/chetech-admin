"use client";

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
  const filteredCustomers = customers.filter((customer) => {
    if (!normalizedSearch) return true;
    const haystack = [customer.fullName, customer.phone, customer.alternatePhone, customer.dni, customer.email, customer.address]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Clientes</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Base importada y manual</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Busqueda rapida por nombre, telefono, DNI, email o domicilio. Por ahora se muestran los ultimos clientes cargados/importados.
          </p>
        </div>
        <div className="w-full lg:max-w-sm">
          <Input onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar cliente o telefono..." value={search} />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-100">
        <div className="grid gap-3 p-3 lg:hidden">
          {filteredCustomers.length ? (
            filteredCustomers.map((customer) => (
              <article className="rounded-[22px] border border-slate-100 bg-white px-4 py-3" key={customer.id}>
                <p className="font-semibold text-slate-950">{customer.fullName}</p>
                <p className="mt-1 text-sm text-slate-600">{customer.phone || customer.alternatePhone || "-"}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-[16px] bg-slate-50 px-3 py-2">
                    <span className="uppercase tracking-[0.14em] text-slate-400">DNI</span>
                    <p className="mt-1 font-semibold text-slate-700">{customer.dni || "-"}</p>
                  </div>
                  <div className="rounded-[16px] bg-slate-50 px-3 py-2">
                    <span className="uppercase tracking-[0.14em] text-slate-400">Alta</span>
                    <p className="mt-1 font-semibold text-slate-700">{formatDate(customer.createdAt)}</p>
                  </div>
                </div>
                {customer.email ? <p className="mt-3 text-xs text-slate-500">{customer.email}</p> : null}
                {customer.address ? <p className="mt-2 text-xs leading-5 text-slate-500">{customer.address}</p> : null}
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">{customer.source}</p>
              </article>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No encontramos clientes con esa busqueda.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
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
                    No encontramos clientes con esa busqueda.
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
