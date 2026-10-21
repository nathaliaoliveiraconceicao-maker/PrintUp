"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, Download, Link2, MessageCircle, Pencil, Send, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertQuoteToOrder } from "@/features/orders/actions";
import { createShareLink, deleteQuote, duplicateQuote, setQuoteStatus } from "./actions";
import type { QuoteActionState } from "./schema";
import { nextStatuses, STATUS_LABEL, type QuoteStatus } from "./status";
import { quoteMessage, whatsappLink } from "./whatsapp";

export interface ShareInfo {
  customerName: string;
  customerPhone: string | null;
  businessName: string | null;
  number: string;
  total: string;
  validUntil: string;
}

const STATUS_BUTTON: Partial<Record<QuoteStatus, string>> = {
  enviado: "Marcar como enviado",
  aprovado: "Marcar como aprovado",
  recusado: "Marcar como recusado",
  rascunho: "Voltar para rascunho",
};

export function QuoteActions({ id, status, share, orderId }: { id: string; status: QuoteStatus; share: ShareInfo; orderId?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<QuoteActionState>({});
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const draft = status === "rascunho";

  const run = (fn: () => Promise<QuoteActionState>, then?: (r: QuoteActionState) => void) =>
    start(async () => {
      setMsg({});
      const r = await fn();
      setMsg(r);
      if (r.ok) {
        then?.(r);
        router.refresh();
      }
    });

  const text = quoteMessage({ ...share, link });
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="space-y-4" data-testid="acoes-orcamento">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <a href={`/orcamentos/${id}/pdf`} target="_blank" rel="noopener"><Download size={16} />Baixar PDF</a>
        </Button>
        <Button disabled={pending} onClick={() => run(() => createShareLink(id), (r) => setLink(r.url ?? null))}>
          <Share2 size={16} />{pending && !link ? "Gerando link…" : link ? "Gerar link novamente" : "Compartilhar"}
        </Button>
        {draft && (
          <Button asChild variant="secondary"><Link href={`/orcamentos/${id}/editar`}><Pencil size={16} />Editar</Link></Button>
        )}
        <Button variant="secondary" disabled={pending} onClick={() => run(() => duplicateQuote(id), (r) => r.quoteId && router.push(`/orcamentos/${r.quoteId}`))}>
          <Copy size={16} />Duplicar
        </Button>
      </div>

      {link && (
        <div className="space-y-3 rounded-xl border border-line bg-paper p-3" data-testid="painel-compartilhar">
          <p className="text-sm">Link do PDF pronto. Ele expira no fim da validade do orçamento.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={whatsappLink(share.customerPhone, text)} target="_blank" rel="noopener noreferrer" data-testid="btn-whatsapp"><MessageCircle size={16} />Abrir no WhatsApp</a>
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setMsg({ error: "Não foi possível copiar. Selecione o link e copie manualmente." });
                }
              }}
            >
              {copied ? <Check size={16} /> : <Link2 size={16} />}{copied ? "Link copiado" : "Copiar link"}
            </Button>
            {canNativeShare && (
              <Button variant="secondary" onClick={() => navigator.share({ title: `Orçamento ${share.number}`, text, url: link }).catch(() => undefined)}>
                <Share2 size={16} />Outros apps
              </Button>
            )}
          </div>
          {!share.customerPhone && <p className="text-xs text-muted">Sem telefone do cliente: o WhatsApp abre para você escolher o contato.</p>}
          <input readOnly value={link} aria-label="Link do PDF" className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base sm:text-sm" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {nextStatuses(status).map((to) => (
          <Button key={to} variant={to === "recusado" ? "ghost" : "secondary"} size="sm" disabled={pending} onClick={() => run(() => setQuoteStatus(id, to))}>
            {to === "enviado" ? <Send size={14} /> : null}
            {STATUS_BUTTON[to] ?? STATUS_LABEL[to]}
          </Button>
        ))}
        {status === "aprovado" && orderId && (
          <Button asChild size="sm"><Link href={`/pedidos/${orderId}`}>Ver pedido deste orçamento</Link></Button>
        )}
        {status === "aprovado" && !orderId && (
          <Button size="sm" disabled={pending} data-testid="transformar-pedido" onClick={() => run(() => convertQuoteToOrder(id), (r) => (r as { orderId?: string }).orderId && router.push(`/pedidos/${(r as { orderId?: string }).orderId}`))}>
            Transformar em pedido
          </Button>
        )}
        {draft && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (confirm("Excluir este rascunho? Esta ação não pode ser desfeita.")) run(() => deleteQuote(id), () => router.push("/orcamentos"));
            }}
          >
            <Trash2 size={14} />Excluir rascunho
          </Button>
        )}
      </div>
      {msg.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg.error}</p>}
      {msg.ok && !link && <p role="status" className="text-sm text-ok">Pronto.</p>}
    </div>
  );
}
