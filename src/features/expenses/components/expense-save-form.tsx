"use client";

import { useEffect, useState, type ReactNode } from "react";
import { saveExpenseAction } from "../actions";
import { acknowledgeExpenseOperation, getExpenseOperationId } from "../operation-id";

export function ExpenseSaveForm({ ownerId, scope, savedOperation, savedScope, children, className }: {
  ownerId: string; scope: string; savedOperation?: string; savedScope?: string; children: ReactNode; className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (savedOperation && savedScope) acknowledgeExpenseOperation(ownerId, savedScope, savedOperation);
  }, [ownerId, savedOperation, savedScope]);

  async function save(form: FormData) {
    let operationId: string;
    try {
      operationId = await getExpenseOperationId(form, ownerId, scope);
    } catch {
      setError("No se pudo conservar la identidad del pago. Habilita el almacenamiento de esta pestaña y vuelve a intentar.");
      return;
    }
    setError(null);
    form.set("operationId", operationId);
    await saveExpenseAction(form);
  }

  return <form action={save} className={className}>{children}{error ? <p className="status-banner status-banner--error xl:col-span-6" role="alert">{error}</p> : null}</form>;
}
