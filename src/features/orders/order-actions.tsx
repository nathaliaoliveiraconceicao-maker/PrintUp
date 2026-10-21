"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelOrder, deleteOrder, setOrderStatus } from "./actions";
import type { OrderActionState } from "./schema";
import { canCancelOrder, nextOrderStatuses, ORDER_STATUS_LABEL, type OrderStatus } from "./status";

export function OrderActions({ id, status, editable, deletable }: { id: string; status: OrderStatus; editable: boolean; deletable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<OrderActionState>({});
  const run = (fn: () => Promise<OrderActionState>, then?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) { then?.(); router.refresh(); }
    });
  return (
    <div className="space-y-3" data-testid="acoes-pedido">
      <div className="flex flex-wrap gap-2">
        {nextOrderStatuses(status).map((to) => (
          <Button key={to} size="sm" variant={to === "entregue" ? "primary" : "secondary"} disabled={pending} onClick={() => run(() => setOrderStatus(id, to))}>
            Marcar como {ORDER_STATUS_LABEL[to].toLowerCase()}
          </Button>
        ))}
        {editable && <Button asChild size="sm" variant="secondary"><Link href={`/pedidos/${id}/editar`}><Pencil size={14} />Editar itens</Link></Button>}
        {canCancelOrder(status) && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Cancelar este pedido? As tarefas abertas serão encerradas e o material reservado, liberado. O que já foi consumido continua consumido.")) run(() => cancelOrder(id)); }}>
            <XCircle size={14} />Cancelar pedido
          </Button>
        )}
        {deletable && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Excluir este pedido? Esta ação não pode ser desfeita.")) run(() => deleteOrder(id), () => router.push("/pedidos")); }}>
            <Trash2 size={14} />Excluir
          </Button>
        )}
      </div>
      {msg.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg.error}</p>}
    </div>
  );
}
