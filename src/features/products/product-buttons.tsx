"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Copy, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveProduct, duplicateProduct, recalculateProducts, setStock } from "./catalog-actions";
import type { ProductActionState } from "./catalog-schema";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ProductActionState>({});
  const run = (fn: () => Promise<ProductActionState>, then?: (r: ProductActionState) => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) {
        then?.(r);
        router.refresh();
      }
    });
  return { pending, msg, run, router };
}

export function ProductButtons({ id, archived, stale, compact }: { id: string; archived: boolean; stale?: boolean; compact?: boolean }) {
  const { pending, msg, run, router } = useRun();
  const size = compact ? "sm" : "md";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!archived && (
          <Button asChild size={size}><Link href={`/orcamentos/novo?produto=${id}`}><FileText size={16} />Criar orçamento</Link></Button>
        )}
        <Button variant="secondary" size={size} disabled={pending} onClick={() => run(() => duplicateProduct(id), (r) => r.productId && router.push(`/produtos/${r.productId}`))}>
          <Copy size={16} />Duplicar
        </Button>
        <Button variant="secondary" size={size} disabled={pending} onClick={() => run(() => archiveProduct(id, !archived))}>
          {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {archived ? "Restaurar" : "Arquivar"}
        </Button>
        {stale && (
          <Button variant="secondary" size={size} disabled={pending} onClick={() => run(() => recalculateProducts([id]))}>
            <RefreshCw size={16} />Recalcular
          </Button>
        )}
      </div>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && msg.message && <p role="status" className="text-sm text-ok">{msg.message}</p>}
    </div>
  );
}

export function StockEditor({ id, qty }: { id: string; qty: number }) {
  const { pending, msg, run } = useRun();
  const [value, setValue] = useState(String(qty));
  return (
    <div className="space-y-1" data-testid="estoque">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted" htmlFor={`estoque-${id}`}>Estoque</label>
        <input
          id={`estoque-${id}`}
          inputMode="numeric"
          className="h-11 w-24 rounded-xl border border-line bg-surface px-3 text-base sm:text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        />
        <Button variant="secondary" size="sm" disabled={pending || value === "" || Number(value) === qty} onClick={() => run(() => setStock(id, Number(value)))}>
          {pending ? "Salvando…" : "Atualizar"}
        </Button>
      </div>
      {msg.error && <p role="alert" className="text-xs text-danger">{msg.error}</p>}
      {msg.ok && <p role="status" className="text-xs text-ok">Estoque atualizado.</p>}
    </div>
  );
}

export function RecalcButton({ ids, label }: { ids: string[]; label: string }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-2">
      <Button disabled={pending || ids.length === 0} onClick={() => run(() => recalculateProducts(ids))}>
        <RefreshCw size={16} className={pending ? "animate-spin" : ""} />
        {pending ? "Recalculando…" : label}
      </Button>
      {msg.error && <p role="alert" className="text-sm text-danger">{msg.error}</p>}
      {msg.ok && msg.message && <p role="status" className="text-sm text-ok">{msg.message}</p>}
    </div>
  );
}
