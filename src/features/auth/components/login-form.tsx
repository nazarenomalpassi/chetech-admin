"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/features/auth/actions";

const initialState = {
  success: true,
  message: ""
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="tu@email.com" required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          Contraseña
        </label>
        <div className="flex items-center gap-2">
          <Input className="flex-1" id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
          <Button type="button" variant="secondary" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? "Ocultar" : "Mostrar"}
          </Button>
        </div>
      </div>
      {state.message ? (
        <p role={state.success ? "status" : "alert"} aria-live="polite" className={`text-sm ${state.success ? "text-graphite" : "text-rose-600"}`}>{state.message}</p>
      ) : null}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
