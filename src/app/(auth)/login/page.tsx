import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6">
          <p className="font-brand text-xl text-graphite">Chetech</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-950">Acceso no disponible</h1>
          <p className="mt-4 text-sm text-slate-600">
            El acceso todavía no está disponible. Contactá al administrador para completar la configuración.
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
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 sm:p-8" aria-labelledby="login-title">
        <div className="mb-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-graphite"><img alt="" src="/brand/chetech-isologo-white.svg" width={24} height={24} /></span>
            <span className="font-brand text-2xl text-graphite">Chetech</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-950" id="login-title">Ingresar al sistema</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Usá tu cuenta para acceder al local y al taller.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
