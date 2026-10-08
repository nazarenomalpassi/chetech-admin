"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";

type FormSubmitButtonProps = ButtonProps & {
  idleLabel: string;
  pendingLabel: string;
};

export function FormSubmitButton({ idleLabel, pendingLabel, ...props }: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} aria-busy={pending} disabled={pending || props.disabled} type="submit">
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        idleLabel
      )}
    </Button>
  );
}
