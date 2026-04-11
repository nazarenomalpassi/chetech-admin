import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { formatCurrency } from "@/lib/utils";
import { getAdminOverview } from "@/features/admin/queries";

export default async function AdminEntryPage() {
  const envReady = hasSupabaseEnv();

  if (!envReady) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-3xl rounded-[32px] border border-white/70 bg-white/90 p-10 shadow-soft backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">Chetech</p>
          <h1 className="mt-4 text-4xl font-semibold text-slate-950">Acceso administrativo</h1>
          <p className="mt-4 text-base text-slate-600">
            Esta página queda pública para confirmar que la app renderiza aunque Supabase todavía no
            esté configurado.
          </p>
          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Faltan variables de entorno de Supabase. Creá `C:\Users\nazar\OneDrive\Escritorio\Chetarda-ai\.env.local`
            usando `.env.example` y completá `NEXT_PUBLIC_SUPABASE_URL` y
            `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
          </div>
        </div>
      </main>
    );
  }

  await requireUser();
  const data = await getAdminOverview();

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">Chetech</p>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950">Vista rápida del admin</h1>
              <p className="mt-3 text-base text-slate-600">
                Esta entrada ya está conectada a Supabase y muestra productos reales importados.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex h-11 items-center rounded-2xl bg-brand-600 px-5 text-sm font-medium text-white"
                href="/dashboard"
              >
                Ir a dashboard
              </Link>
              <Link
                className="inline-flex h-11 items-center rounded-2xl bg-white px-5 text-sm font-medium text-slate-700 ring-1 ring-slate-200"
                href="/productos"
              >
                Ver todos los productos
              </Link>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-slate-500">Ventas</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{data.stats.sales}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Gastos</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{data.stats.expenses}</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Reparaciones</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{data.stats.repairs}</p>
          </Card>
        </div>

        <Card>
          <p className="text-sm text-slate-500">Productos reales</p>
          <h2 className="text-2xl font-semibold text-slate-950">Primeros productos cargados</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product: any) => (
                  <tr className="border-t border-slate-100" key={product.id}>
                    <td className="px-4 py-3 text-slate-600">{product.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                    <td className="px-4 py-3 text-slate-600">{product.stock}</td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(Number(product.sale_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
