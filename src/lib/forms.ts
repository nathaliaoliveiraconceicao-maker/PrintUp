import { z } from "zod";
import { featureMessage } from "./billing/state";
import { parseDecimal } from "./utils";

export type FormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

/** Número digitado em pt-BR. Campo vazio vira `empty` (padrão 0). */
export function decimal(opts: { min?: number; max?: number; empty?: number } = {}) {
  const { min = 0, max = 1_000_000, empty = 0 } = opts;
  return z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? empty : parseDecimal(v)) : v),
    z.number({ error: "Informe um número válido." }).min(min, `Mínimo ${min}.`).max(max, `Máximo ${max}.`),
  );
}

export const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

export const optionalText = (max = 200) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export function zodToState(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { error: "Revise os campos destacados.", fieldErrors };
}

/** Traduz erros do Postgres/Supabase para mensagens ao usuário (sem vazar detalhes internos). */
export function dbErrorMessage(err: { code?: string; message?: string }): string {
  if (err.code === "P0001") {
    const feat = /^Recurso não disponível no seu plano \((\w+)\)/.exec(err.message ?? "");
    if (feat) return featureMessage(feat[1]);
    // Mensagens próprias das regras de pedidos, produção e estoque (migration 0008): escritas por nós, seguras para mostrar.
    if (err.message && /^(Estoque (insuficiente|físico)|Quantidade (maior|do lote)|O valor (passa|recebido)|O estorno|Pedido (cancelado|em produção|entregue)|Só pedidos|Só orçamentos|Tarefa|Informe|Escolha|Este (pedido|item)|Há tarefas|Bobina|Use Concluir|Para cancelar|O saldo|O pedido precisa|Os totais do pedido)/.test(err.message)) {
      return err.message;
    }
    // Mensagens próprias das regras de orçamento (migration 0006): seguras para mostrar.
    if (err.message?.includes("não pode ser alterado")) return "Este orçamento já foi enviado e não pode ser alterado. Duplique-o para fazer mudanças.";
    if (err.message?.includes("Mudança de status")) return "Essa mudança de status não é permitida.";
    if (err.message?.includes("totais")) return "Os totais do orçamento não fecham. Revise os itens e tente de novo.";
    if (err.message?.includes("ao menos um item")) return "Adicione ao menos um item ao orçamento.";
    return err.message?.includes("Limite")
      ? "Você atingiu o limite do seu plano. Faça upgrade para cadastrar mais itens."
      : "Sua assinatura está inativa ou expirada.";
  }
  if (err.code === "P0002") return "Registro não encontrado. Atualize a página e tente de novo.";
  if (err.code === "42501") return "Você não tem permissão para esta operação.";
  return "Não foi possível salvar. Tente novamente.";
}
