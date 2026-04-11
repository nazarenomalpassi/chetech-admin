"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction } from "@/features/auth/actions";

const initialState = {
  success: true,
  message: ""
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <Input id="email" name="email" type="email" placeholder="admin@chetech.com" required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          Contraseña
        </label>
        <Input id="password" name="password" type="password" placeholder="••••••••" required />
      </div>
      {state.message ? (
        <p className={`text-sm ${state.success ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</p>
      ) : null}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
