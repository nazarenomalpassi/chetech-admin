import { redirect } from "next/navigation";
import { LockKeyhole, MonitorSmartphone } from "lucide-react";

import { LoginForm } from "@/features/auth/components/login-form";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-2xl rounded-[32px] border border-white/70 bg-white/90 p-10 shadow-soft backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">Chetech</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-950">Falta configurar Supabase</h1>
          <p className="mt-4 text-sm text-slate-600">
            La pantalla de login no puede inicializarse sin `NEXT_PUBLIC_SUPABASE_URL` y
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen bg-[linear-gradient(140deg,#f6faf7_0%,#e8f2ee_42%,#dbe7e1_100%)] lg:grid-cols-[1.15fr_0.85fr]">
      <section className="hidden flex-col justify-between px-10 py-12 lg:flex">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-brand-700">Chetech</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight text-slate-950">
            Todo el local en una sola operación clara.
          </h1>
          <p className="mt-6 text-lg text-slate-600">
            Controlá productos, ventas, gastos y reparaciones desde una interfaz pensada para el día
            a día del mostrador.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-soft">
            <MonitorSmartphone className="h-6 w-6 text-brand-700" />
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Operación omnicanal</h2>
            <p className="mt-2 text-sm text-slate-500">
              Inventario, ventas y reparaciones conectados sobre una misma base.
            </p>
          </div>
          <div className="rounded-3xl border border-white/60 bg-[#12332c] p-6 text-white shadow-soft">
            <LockKeyhole className="h-6 w-6 text-brand-200" />
            <h2 className="mt-4 text-lg font-semibold">Acceso seguro</h2>
            <p className="mt-2 text-sm text-emerald-100/80">
              Roles, auditoría y protección de rutas listos para crecer con el negocio.
            </p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white/90 p-8 shadow-soft backdrop-blur">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-brand-700">Bienvenido</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-950">Ingresar al panel</h2>
            <p className="mt-2 text-sm text-slate-500">
              Usá tu cuenta de Supabase Auth para entrar a Chetech.
            </p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
