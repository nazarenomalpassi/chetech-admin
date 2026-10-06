"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body className="m-0 bg-[#f4f4f1] font-sans text-[#171717]">
        <main className="grid min-h-screen place-items-center px-4 py-10">
          <section className="w-full max-w-lg rounded-[28px] border border-black/10 bg-white p-7 shadow-[0_24px_70px_rgba(0,0,0,0.1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Chetech</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">No pudimos abrir el sistema.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Tus datos no se modificaron. Intenta cargar nuevamente o vuelve al dashboard para continuar.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                className="rounded-full bg-[#1c1b19] px-5 py-3 text-sm font-semibold text-white"
                onClick={reset}
                type="button"
              >
                Intentar nuevamente
              </button>
              <a
                className="rounded-full border border-black/10 px-5 py-3 text-center text-sm font-semibold"
                href="/dashboard"
              >
                Volver al dashboard
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
