"use client";

import { startTransition, useActionState } from "react";

/**
 * Como `useActionState`, mas sem o reset automático de campos do React 19 (que apagaria o que o
 * usuário digitou quando a action devolve erro). Envia via onSubmit dentro de uma transição.
 */
export function useActionForm<S extends object>(action: (state: S, formData: FormData) => Promise<S>, initial: S) {
  const [state, run, pending] = useActionState<S, FormData>(
    action as (state: Awaited<S>, formData: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => run(data));
  };
  return { state, onSubmit, pending };
}
