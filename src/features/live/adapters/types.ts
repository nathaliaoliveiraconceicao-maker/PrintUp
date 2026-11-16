/**
 * PrintUp Live — contrato dos adaptadores de impressora (Fase 1: só tipos e regras puras, sem I/O).
 *
 * Um adaptador roda no CONECTOR LOCAL (rede do usuário), nunca na Vercel. Cada adaptador declara quais
 * capacidades realmente suporta; o que não foi declarado não existe para a interface. Valor desconhecido é
 * `null`: nunca inventamos dado ausente.
 */

export const CAPABILITIES = [
  "status",
  "progress",
  "temperatures",
  "layer",
  "camera_snapshot",
  "camera_stream",
  "pause",
  "resume",
  "cancel",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Capacidades que alteram a impressora. Só ficam disponíveis com nível `verificado` + confirmação do usuário. */
export const COMMAND_CAPABILITIES = ["pause", "resume", "cancel"] as const satisfies readonly Capability[];
export type CommandCapability = (typeof COMMAND_CAPABILITIES)[number];

export const isCommand = (c: Capability): c is CommandCapability => (COMMAND_CAPABILITIES as readonly Capability[]).includes(c);

/**
 * Quão firme é o suporte a uma capacidade:
 * - `verificado`: testado contra um equipamento real (e o teste está versionado);
 * - `documentado`: o mecanismo consta na documentação oficial, mas ainda não foi testado em equipamento;
 * - `experimental`: só há fontes não oficiais (engenharia reversa) — sempre rotulado na interface;
 * - `a_confirmar`: provável, mas a documentação ainda não foi conferida;
 * - `nao_suportado`: não será oferecido.
 */
export type SupportLevel = "verificado" | "documentado" | "experimental" | "a_confirmar" | "nao_suportado";

export type AdapterId = "octoprint" | "moonraker" | "bambu";

/** Estado normalizado da impressão. */
export const PRINTER_STATES = ["offline", "idle", "preparing", "printing", "paused", "finished", "failed", "error", "unknown"] as const;
export type PrinterState = (typeof PRINTER_STATES)[number];

export type NormalizedState = {
  /** Há comunicação com a impressora agora? Independe do estado da impressão. */
  connected: boolean;
  state: PrinterState;
  jobName: string | null;
  progressPercent: number | null;
  elapsedSeconds: number | null;
  remainingSeconds: number | null;
  nozzleC: number | null;
  nozzleTargetC: number | null;
  bedC: number | null;
  bedTargetC: number | null;
  layer: { current: number; total: number | null } | null;
  /** Filamento consumido até agora, em milímetros, quando a fonte informa. Nunca estimado por nós. */
  filamentUsedMm: number | null;
  /** Quando o CONECTOR leu estes dados (ISO 8601). Base para detectar dado desatualizado. */
  observedAt: string;
};

export type CameraInfo = {
  /** Endereço acessível SÓ pelo conector (rede local). Nunca é enviado ao navegador nem à nuvem. */
  snapshotUrl: string | null;
  streamUrl: string | null;
};

export type AdapterContext = {
  /** Credenciais e endereço ficam só no conector. */
  config: Readonly<Record<string, string>>;
  fetch: typeof fetch;
  signal?: AbortSignal;
};

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly kind: "credencial" | "rede" | "formato" | "nao_suportado" | "indisponivel",
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** Implementação de um adaptador (vive no conector local, Fases 3 e 5). */
export interface PrinterAdapter {
  readonly id: AdapterId;
  /** O que ESTA instância suporta de fato, confirmado na conexão (pode ser menos que o catálogo). */
  readonly capabilities: ReadonlySet<Capability>;
  readFullState(ctx: AdapterContext): Promise<NormalizedState>;
  /** Assina mudanças quando o equipamento oferece push; devolve a função que cancela a assinatura. */
  subscribe?(ctx: AdapterContext, onState: (s: NormalizedState) => void): Promise<() => void>;
  camera?(ctx: AdapterContext): Promise<CameraInfo>;
  /** Só existe se o adaptador declarar ao menos uma capacidade de comando. */
  execute?(ctx: AdapterContext, command: CommandCapability): Promise<void>;
}

/** O adaptador declarou a capacidade? */
export const supports = (a: Pick<PrinterAdapter, "capabilities">, c: Capability) => a.capabilities.has(c);

/** Garante que um comando só chega ao equipamento se o adaptador o declarar. */
export function assertCanExecute(a: Pick<PrinterAdapter, "capabilities" | "execute">, command: CommandCapability): void {
  if (!supports(a, command) || typeof a.execute !== "function") {
    throw new AdapterError(`Esta impressora não suporta o comando "${command}".`, "nao_suportado");
  }
}
