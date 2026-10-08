"use client";

import { Link2, Search, Unlink, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { setRepairCustomerLinkAction } from "@/features/repairs-access/actions";
import type { StorefrontCustomerSummary } from "@/features/repairs-access/queries";

type SearchResponse = {
  customers?: StorefrontCustomerSummary[];
  error?: string;
};

export function RepairCustomerLinkCard({
  orderId,
  linkedCustomer
}: {
  orderId: string;
  linkedCustomer: StorefrontCustomerSummary | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StorefrontCustomerSummary[]>([]);
  const [selected, setSelected] = useState<StorefrontCustomerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const normalizedQuery = query.trim();
    setSelected(null);

    if (normalizedQuery.length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/repair-access/storefront-customers?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as SearchResponse;

        if (!response.ok) {
          throw new Error(payload.error || "No se pudieron buscar clientes.");
        }

        setResults(payload.customers ?? []);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setResults([]);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron buscar clientes."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-1 shrink-0 text-slate-500">
          <Link2 aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Cuenta del cliente</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Vincula una cuenta para consultar esta reparacion.
          </p>
        </div>
      </div>

      <div className="mt-4 border-y border-slate-200 py-3">
        <p className="text-sm font-medium text-slate-500">
          Vinculación actual
        </p>
        {linkedCustomer ? (
          <div className="mt-3 flex items-start gap-3">
            <UserRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 text-sm">
              <p className="break-words font-semibold text-slate-900">{linkedCustomer.fullName}</p>
              <p className="mt-1 break-all text-slate-500">
                {linkedCustomer.email || "Sin email registrado"}
              </p>
              <p className="mt-1 break-words text-slate-500">
                {linkedCustomer.phone || "Sin teléfono registrado"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Esta reparación todavía no tiene una cuenta vinculada.</p>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor={`storefront-customer-search-${orderId}`}>
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Buscar por nombre, apellido, email o teléfono
          </span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            />
            <Input
              autoComplete="off"
              className="pl-11"
              id={`storefront-customer-search-${orderId}`}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Escribí al menos 2 caracteres"
              type="search"
              value={query}
            />
          </span>
        </label>

        <div aria-live="polite" className="mt-2 text-xs text-slate-500">
          {loading ? "Buscando cuentas..." : null}
          {!loading && query.trim().length === 1 ? "Escribí un carácter más para buscar." : null}
          {!loading && query.trim().length >= 2 && !error && results.length === 0
            ? "No encontramos cuentas con esos datos."
            : null}
          {error ? <span className="text-rose-600">{error}</span> : null}
        </div>

        {results.length ? (
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {results.map((customer) => {
              const isSelected = selected?.id === customer.id;
              return (
                <button
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-graphite bg-graphite text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  key={customer.id}
                  onClick={() => setSelected(customer)}
                  type="button"
                >
                  <span className="block break-words text-sm font-semibold">{customer.fullName}</span>
                  <span className={`mt-1 block break-all text-xs ${isSelected ? "text-white/70" : "text-slate-500"}`}>
                    {[customer.email, customer.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <form
          action={setRepairCustomerLinkAction}
          onSubmit={(event) => {
            if (!selected) {
              event.preventDefault();
              return;
            }
            if (
              linkedCustomer &&
              linkedCustomer.id !== selected.id &&
              !window.confirm(
                `Vas a cambiar la cuenta vinculada de ${linkedCustomer.fullName} a ${selected.fullName}. ¿Continuar?`
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input name="orderId" type="hidden" value={orderId} />
          <input name="customerUserId" type="hidden" value={selected?.id ?? ""} />
          <Button className="w-full" disabled={!selected} type="submit">
            <Link2 aria-hidden="true" className="h-4 w-4" />
            {linkedCustomer ? "Cambiar cuenta" : "Vincular cuenta"}
          </Button>
        </form>

        <form
          action={setRepairCustomerLinkAction}
          onSubmit={(event) => {
            if (
              linkedCustomer &&
              !window.confirm(
                `Vas a desvincular a ${linkedCustomer.fullName}. La reparación conservará su información. ¿Continuar?`
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input name="orderId" type="hidden" value={orderId} />
          <input name="customerUserId" type="hidden" value="" />
          <Button className="w-full" disabled={!linkedCustomer} type="submit" variant="secondary">
            <Unlink aria-hidden="true" className="h-4 w-4" />
            Desvincular
          </Button>
        </form>
      </div>
    </Card>
  );
}
