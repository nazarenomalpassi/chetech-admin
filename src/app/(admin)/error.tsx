"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const digest = error.digest ? `Codigo: ${error.digest}` : null;

  return (
    <Card className="mx-auto max-w-2xl p-5 lg:p-6" role="alert">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="inline-flex h-14 w-14 flex-none items-center justify-center rounded-[22px] border border-rose-200 bg-rose-50 text-rose-700">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="panel-kicker">Error de carga</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            No se pudieron cargar los datos.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Intentá cargar esta sección nuevamente. Si el problema continúa, conservá el código del error para consultarlo.
          </p>
          {digest ? <p className="mt-3 text-xs text-slate-600">{digest}</p> : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button onClick={reset} type="button">
              <RotateCcw className="mr-2 h-4 w-4" />
              Intentar nuevamente
            </Button>
            <Link className={cn(buttonVariants({ variant: "secondary" }), "justify-center")} href="/dashboard">
              Volver al dashboard
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
