import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
          <p className="font-brand text-xl text-foreground">Chetech</p>
          <h1 className="mt-4 text-3xl font-semibold text-foreground">Acceso no disponible</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            El acceso todavía no está disponible. Contactá al administrador para completar la
            configuración.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-graphite p-10 text-white lg:flex lg:flex-col lg:justify-between"
      >
        <img
          alt=""
          className="h-auto w-[180px]"
          height={53}
          src="/brand/chetech-horizontal-white.svg"
          width={180}
        />
        <div className="relative">
          <p className="max-w-md text-3xl leading-tight font-semibold text-balance">
            Taller, mostrador y caja en un solo lugar.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">
            Órdenes, cobros, ventas y comprobantes, con el historial de cada equipo a mano.
          </p>
        </div>
        <p className="text-xs text-white/50">Sistema interno de CheTech</p>
        <span className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full border border-white/8" />
        <span className="pointer-events-none absolute -right-8 -bottom-8 h-64 w-64 rounded-full border border-white/8" />
      </aside>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <section aria-labelledby="login-title" className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <img alt="" src="/brand/chetech-isologo-white.svg" width={24} height={24} />
            </span>
            <span className="font-brand text-2xl text-foreground">Chetech</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground" id="login-title">
            Ingresar al sistema
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Usá tu cuenta para acceder al local y al taller.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
