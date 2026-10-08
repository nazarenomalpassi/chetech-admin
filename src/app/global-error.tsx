"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body className="m-0 bg-[#f4f4f1] font-sans text-[#171717]">
        <main className="grid min-h-screen place-items-center px-4 py-10">
          <section className="w-full max-w-lg rounded-xl border border-black/10 bg-white p-6" role="alert">
            <p className="text-sm font-semibold text-slate-600">Chetech</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">No pudimos abrir el sistema.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Intentá cargar nuevamente. Si estabas guardando una operación, revisá su estado antes de repetirla.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                className="min-h-11 rounded-lg bg-[#1c1b19] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                onClick={reset}
                type="button"
              >
                Intentar nuevamente
              </button>
              <a
                className="min-h-11 rounded-lg border border-black/10 px-5 py-3 text-center text-sm font-semibold"
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
