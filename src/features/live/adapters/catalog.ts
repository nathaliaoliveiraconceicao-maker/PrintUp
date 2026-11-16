import type { AdapterId, Capability, SupportLevel } from "./types";
import { isCommand } from "./types";

/**
 * Catálogo de adaptadores: o que cada integração promete HOJE e em que evidência se apoia.
 * Fase 1: nenhum item está `verificado` (não há equipamento real testado). Subir um nível exige a
 * evidência (documentação oficial ou teste em equipamento) registrada em `docs/LIVE.md`.
 */
export type CatalogEntry = {
  id: AdapterId;
  label: string;
  /** Todos conversam com a impressora pela rede local, então exigem o conector local. */
  requiresLocalConnector: true;
  /** Situação geral, no mesmo espírito do módulo de Ofertas. */
  status: "preparado_nao_verificado" | "experimental_nao_verificado" | "pronto";
  capabilities: Readonly<Record<Capability, SupportLevel>>;
  /** Evidência e ressalvas (exibidas ao usuário nas configurações). */
  notes: readonly string[];
};

const none: Record<Capability, SupportLevel> = {
  status: "nao_suportado",
  progress: "nao_suportado",
  temperatures: "nao_suportado",
  layer: "nao_suportado",
  camera_snapshot: "nao_suportado",
  camera_stream: "nao_suportado",
  pause: "nao_suportado",
  resume: "nao_suportado",
  cancel: "nao_suportado",
};

export const ADAPTER_CATALOG: readonly CatalogEntry[] = [
  {
    id: "octoprint",
    label: "OctoPrint",
    requiresLocalConnector: true,
    status: "preparado_nao_verificado",
    capabilities: {
      ...none,
      status: "documentado", // GET /api/printer e GET /api/job (docs.octoprint.org)
      progress: "documentado", // GET /api/job
      temperatures: "documentado", // GET /api/printer
      layer: "a_confirmar", // não consta na API básica; depende de plugin
      camera_snapshot: "documentado", // /api/settings → webcam.snapshotUrl (muda na v2.0)
      camera_stream: "documentado", // /api/settings → webcam.streamUrl (muda na v2.0)
      pause: "a_confirmar", // POST /api/job (só "start" foi conferido até aqui)
      resume: "a_confirmar",
      cancel: "a_confirmar",
    },
    notes: [
      "Autenticação por chave de API no cabeçalho X-Api-Key; a chave fica só no conector.",
      "A URL da câmera é lida das configurações do OctoPrint; a versão 2.0 usa um modelo de várias câmeras.",
      "Push em tempo real e campo de filamento a conferir na Fase 3.",
    ],
  },
  {
    id: "moonraker",
    label: "Moonraker / Klipper",
    requiresLocalConnector: true,
    status: "preparado_nao_verificado",
    capabilities: {
      ...none,
      status: "a_confirmar", // WebSocket JSON-RPC: printer.objects.subscribe + notify_status_update (documentado); objetos exatos a conferir
      progress: "a_confirmar",
      temperatures: "a_confirmar",
      layer: "a_confirmar",
      camera_snapshot: "documentado", // server.webcams.list → snapshot_url
      camera_stream: "documentado", // server.webcams.list → stream_url
      pause: "a_confirmar",
      resume: "a_confirmar",
      cancel: "a_confirmar",
    },
    notes: [
      "Atualizações por WebSocket (printer.objects.subscribe), o que evita consultas repetidas.",
      "Autenticação do Moonraker (clientes confiáveis, chave de API ou JWT) a conferir na Fase 3.",
    ],
  },
  {
    id: "bambu",
    label: "Bambu Lab (modo LAN)",
    requiresLocalConnector: true,
    status: "experimental_nao_verificado",
    capabilities: {
      ...none,
      status: "experimental", // MQTT 8883 no modo LAN/Developer Mode; protocolo sem documentação oficial
      progress: "experimental",
      temperatures: "experimental",
      layer: "experimental",
      camera_snapshot: "experimental", // 322 (RTSPS) ou 6000 conforme o modelo; só fontes de terceiros
      camera_stream: "experimental",
      pause: "nao_suportado", // comandos passam por fluxo de autorização fechado da Bambu
      resume: "nao_suportado",
      cancel: "nao_suportado",
    },
    notes: [
      "Exige modo LAN/Developer Mode ativado na impressora; a Bambu declara que não dá suporte a ele.",
      "Somente leitura: não prometemos comandos remotos.",
      "O protocolo não é documentado oficialmente; qualquer compatibilidade só será declarada após teste em equipamento real.",
    ],
  },
];

export const catalogEntry = (id: string): CatalogEntry | null => ADAPTER_CATALOG.find((e) => e.id === id) ?? null;

/** A interface pode mostrar esta capacidade de LEITURA? (experimental aparece, mas rotulado.) */
export const canShowReading = (level: SupportLevel) => level === "verificado" || level === "documentado" || level === "experimental";

/** Comandos remotos: só com suporte `verificado` em equipamento real. Documentação sozinha não basta. */
export const canOfferCommand = (level: SupportLevel) => level === "verificado";

/** Capacidades que a interface pode exibir para o adaptador, já aplicando as regras acima. */
export function visibleCapabilities(entry: CatalogEntry): Capability[] {
  return (Object.keys(entry.capabilities) as Capability[]).filter((c) =>
    isCommand(c) ? canOfferCommand(entry.capabilities[c]) : canShowReading(entry.capabilities[c]),
  );
}
