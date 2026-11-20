"use client";

import { useId } from "react";
import type { PickupAnswer } from "../pickup";

const OPTIONS: Array<{ value: PickupAnswer; label: string }> = [
  { value: "si", label: "Sí, lo retiró" },
  { value: "no", label: "No, todavía no" }
];

/**
 * Pregunta obligatoria cuando el cobro salda una orden lista para entregar.
 * Con "Sí" se registra la entrega junto con el cobro; con "No" la orden queda cobrada
 * y el retiro se marca después desde la ficha.
 */
export function PickupQuestion({
  value,
  onChange,
  customerName,
  name = "pickedUp",
  disabled = false
}: {
  value: PickupAnswer | null;
  onChange: (value: PickupAnswer) => void;
  customerName?: string;
  name?: string;
  disabled?: boolean;
}) {
  const hintId = useId();
  const recipient = customerName?.trim() || "el cliente";
  return (
    <fieldset
      aria-describedby={hintId}
      disabled={disabled}
      className="grid min-w-0 gap-2 rounded-xl border border-border p-3"
    >
      <legend className="px-1 text-sm font-semibold text-foreground">
        ¿El cliente retiró el equipo?
      </legend>
      <div className="@container">
        <div className="grid gap-2 @[20rem]:grid-cols-2">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm has-checked:border-foreground has-checked:bg-muted has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-solid"
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                required
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="shrink-0"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
      <p id={hintId} className="text-xs leading-5 text-muted-foreground">
        {value === "no"
          ? "La orden queda cobrada y sin retirar. El retiro se marca después desde la ficha, con Registrar entrega."
          : `Con "Sí" se registra la entrega a nombre de ${recipient}, con fecha de hoy.`}
      </p>
    </fieldset>
  );
}
