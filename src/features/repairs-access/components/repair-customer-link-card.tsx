"use client";

import { Link2, Search, Unlink, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { setRepairCustomerLinkAction } from "@/features/repairs-access/actions";
import type { StorefrontCustomerSummary } from "@/features/repairs-access/queries";
import { confirmSubmit } from "@/components/ui/confirm-dialog";

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
          requestError instanceof Error ? requestError.message : "No se pudieron buscar clientes."
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
        <span className="mt-1 shrink-0 text-muted-foreground">
          <Link2 aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cuenta del cliente</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Vincula una cuenta para consultar esta reparacion.
          </p>
        </div>
      </div>

      <div className="mt-4 border-y border-border py-3">
        <p className="text-sm font-medium text-muted-foreground">Vinculación actual</p>
        {linkedCustomer ? (
          <div className="mt-3 flex items-start gap-3">
            <UserRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold wrap-break-word text-foreground">
                {linkedCustomer.fullName}
              </p>
              <p className="mt-1 break-all text-muted-foreground">
                {linkedCustomer.email || "Sin email registrado"}
              </p>
              <p className="mt-1 wrap-break-word text-muted-foreground">
                {linkedCustomer.phone || "Sin teléfono registrado"}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Esta reparación todavía no tiene una cuenta vinculada.
          </p>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor={`storefront-customer-search-${orderId}`}>
          <span className="mb-2 block text-sm font-medium text-body">
            Buscar por nombre, apellido, email o teléfono
          </span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
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

        <div aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          {loading ? "Buscando cuentas..." : null}
          {!loading && query.trim().length === 1 ? "Escribí un carácter más para buscar." : null}
          {!loading && query.trim().length >= 2 && !error && results.length === 0
            ? "No encontramos cuentas con esos datos."
            : null}
          {error ? <span className="text-danger">{error}</span> : null}
        </div>

        {results.length ? (
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {results.map((customer) => {
              const isSelected = selected?.id === customer.id;
              return (
                <button
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-body hover:border-border-strong hover:bg-muted"
                  }`}
                  key={customer.id}
                  onClick={() => setSelected(customer)}
                  type="button"
                >
                  <span className="block text-sm font-semibold wrap-break-word">
                    {customer.fullName}
                  </span>
                  <span
                    className={`mt-1 block text-xs break-all ${isSelected ? "text-white/70" : "text-muted-foreground"}`}
                  >
                    {[customer.email, customer.phone].filter(Boolean).join(" · ") ||
                      "Sin datos de contacto"}
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
            if (linkedCustomer && linkedCustomer.id !== selected.id) {
              confirmSubmit(event, {
                title: "¿Cambiar la cuenta vinculada?",
                description: `Pasa de ${linkedCustomer.fullName} a ${selected.fullName}.`,
                confirmLabel: "Cambiar cuenta"
              });
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
            if (linkedCustomer) {
              confirmSubmit(event, {
                title: `¿Desvincular a ${linkedCustomer.fullName}?`,
                description: "La reparación conserva su información.",
                confirmLabel: "Desvincular",
                tone: "danger"
              });
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
