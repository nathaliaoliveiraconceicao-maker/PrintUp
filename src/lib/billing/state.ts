/** Estados da assinatura como o banco (`current_entitlements`) os devolve, com rótulos e a regra de acesso de cada um. */
export const SUBSCRIPTION_STATES = ["gratuito", "em_teste", "ativo", "pagamento_pendente", "inadimplente", "cancelamento_agendado", "cancelado", "expirado"] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export const STATE_LABEL: Record<SubscriptionState, string> = {
  gratuito: "Plano Gratuito",
  em_teste: "Em teste",
  ativo: "Ativa",
  pagamento_pendente: "Pagamento pendente",
  inadimplente: "Inadimplente",
  cancelamento_agendado: "Cancelamento agendado",
  cancelado: "Cancelada",
  expirado: "Teste encerrado",
};

/** Texto de "o que isso significa para o seu acesso" (as regras reais estão em `current_entitlements`). */
export const STATE_ACCESS: Record<SubscriptionState, string> = {
  gratuito: "Você usa os recursos e limites do plano Gratuito.",
  em_teste: "Você tem os recursos do plano Pro durante o período de teste.",
  ativo: "Todos os recursos e limites do seu plano estão liberados.",
  pagamento_pendente: "A última cobrança falhou. Seu plano continua ativo por alguns dias, enquanto o pagamento é regularizado.",
  inadimplente: "O pagamento não foi regularizado: você voltou aos limites do plano Gratuito. Seus dados continuam salvos e visíveis; só novos cadastros acima do limite ficam bloqueados.",
  cancelamento_agendado: "Seu plano continua ativo até o fim do período já pago; depois você volta ao Gratuito, sem perder dados.",
  cancelado: "A assinatura foi cancelada. Você usa o plano Gratuito e seus dados continuam salvos.",
  expirado: "O período de teste terminou. Você usa o plano Gratuito e seus dados continuam salvos.",
};

export interface EntitlementRow {
  plan_code: string;
  status: string;
  state: SubscriptionState;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
  active: boolean;
  period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan_code: string | null;
  billing_cycle: "mensal" | "anual" | null;
}

/** Estados em que o cliente está usando um plano pago (ou o teste). */
export const isPaidAccess = (s: SubscriptionState): boolean => s === "em_teste" || s === "ativo" || s === "pagamento_pendente" || s === "cancelamento_agendado";
/** Estados que pedem atenção do cliente (aviso no painel). */
export const needsAttention = (s: SubscriptionState): boolean => s === "pagamento_pendente" || s === "inadimplente";

/**
 * Recursos conhecidos. `available` diz se já está implementado: o que ainda não existe aparece como "em breve"
 * na página de planos, mesmo que o plano o liste (nunca se vende como pronto o que não está).
 */
export const FEATURES: Record<string, { label: string; available: boolean }> = {
  calculator: { label: "Calculadora de precificação", available: true },
  import_models: { label: "Importação de modelos 3MF e G-code", available: true },
  quotes: { label: "Orçamentos em PDF", available: true },
  pricing_history: { label: "Histórico de precificações", available: true },
  orders: { label: "Gestão de pedidos", available: true },
  stock: { label: "Controle de estoque de filamento", available: true },
  production: { label: "Produção em quadro Kanban", available: true },
  production_advanced: { label: "Gestão de produção avançada", available: false },
  reports: { label: "Relatórios financeiros", available: false },
};

export const LIMIT_LABEL: Record<string, string> = {
  max_products: "Produtos cadastrados",
  max_printers: "Impressoras",
  max_filaments: "Filamentos",
  max_imports_month: "Importações de modelos por mês",
  max_pdf_month: "PDFs de orçamento por mês",
  max_storage_mb: "Armazenamento (MB)",
};

export const limitText = (v: number | null | undefined): string => (v === null || v === undefined ? "Ilimitado" : v.toLocaleString("pt-BR"));

export function percentUsed(used: number, limit: number | null | undefined): number | null {
  if (limit === null || limit === undefined) return null;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Mapeia o nome do recurso nas mensagens do banco para um texto amigável. */
export function featureMessage(feature: string): string {
  const f = FEATURES[feature]?.label ?? "Este recurso";
  return `${f} não está incluído no seu plano atual. Veja os planos para liberar.`;
}

export const formatPriceCents = (cents: number): string => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
