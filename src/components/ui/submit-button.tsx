"use client";

import { Button, type ButtonProps } from "./button";

export function SubmitButton({ children, pending, ...props }: ButtonProps & { pending?: boolean }) {
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? "Salvando…" : children}
    </Button>
  );
}
