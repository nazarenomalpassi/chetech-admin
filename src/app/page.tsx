import Link from "next/link";
import type { Route } from "next";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-2xl rounded-[32px] border border-white/70 bg-white/90 p-10 text-center shadow-soft backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">Chetech</p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-950">Chetech funcionando</h1>
        <p className="mt-4 text-base text-slate-600">
          El render básico de Next está respondiendo correctamente en la ruta principal.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700"
            href={"/admin" as Route}
          >
            Ir a /admin
          </Link>
        </div>
      </div>
    </main>
  );
}
