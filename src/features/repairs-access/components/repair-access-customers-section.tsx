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
        <div className="overflow-x-auto">
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
