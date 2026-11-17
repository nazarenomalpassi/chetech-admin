import { ShieldX } from "lucide-react";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-accent px-6 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ShieldX aria-hidden="true" className="h-7 w-7" />
        </span>
        <p className="mt-6 text-sm text-body">Panel Chetech</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">Esta cuenta no tiene acceso</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Tu sesión es válida, pero el panel administrativo está reservado para administradores y
          técnicos autorizados.
        </p>
        <form action="/auth/sign-out" className="mt-8" method="post">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary"
            type="submit"
          >
            Cerrar sesión
          </button>
        </form>
      </section>
    </main>
  );
}
