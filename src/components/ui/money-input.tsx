"use client";

import { useState, type InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";
import { roundPaymentAmount } from "@/lib/payment-splits";

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function MoneyInput({ value, onValueChange, ...props }: MoneyInputProps) {
  const [draft, setDraft] = useState<{ text: string; amount: number } | null>(null);
  const text = draft && draft.amount === value ? draft.text : value > 0 ? String(roundPaymentAmount(value)) : "";

  return <Input {...props} type="text" inputMode="decimal" value={text}
    onChange={(event) => {
      const next = event.target.value.trim().replace(/^\$\s*/, "");
      if (!/^\d*(?:[.,]\d{0,2})?$/.test(next)) return;
      const amount = next === "" || next === "," || next === "." ? 0 : Number(next.replace(",", "."));
      setDraft({ text: next, amount });
      onValueChange(amount);
    }}
    onBlur={(event) => {
      setDraft(null);
      props.onBlur?.(event);
    }} />;
}
