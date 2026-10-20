"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function DeleteButton({ action, what }: { action: () => Promise<void>; what: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Excluir ${what}`}
      disabled={pending}
      onClick={() => {
        if (confirm(`Excluir "${what}"? Esta ação não pode ser desfeita.`)) start(() => action());
      }}
    >
      <Trash2 size={18} />
    </Button>
  );
}
