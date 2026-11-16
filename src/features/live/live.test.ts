import { describe, expect, it } from "vitest";
import { ADAPTER_CATALOG, canOfferCommand, canShowReading, catalogEntry, visibleCapabilities } from "./adapters/catalog";
import { AdapterError, CAPABILITIES, COMMAND_CAPABILITIES, assertCanExecute, isCommand, supports } from "./adapters/types";
import type { PrinterAdapter } from "./adapters/types";
import {
  COMMAND_TTL_SECONDS,
  HEARTBEAT_MS,
  MIN_WRITE_INTERVAL_MS,
  commandExpired,
  commandRequestSchema,
  connectionIndicator,
  freshness,
  shouldWrite,
  telemetryEnvelopeSchema,
} from "./telemetry";

const PID = "5b0f6c0e-7a53-4a9c-9a37-3b1c1d3f6a10";
const NOW = Date.parse("2026-11-16T12:00:00.000Z");
const iso = (agoSec: number) => new Date(NOW - agoSec * 1000).toISOString();

const baseState = {
  connected: true,
  state: "printing",
  jobName: "chaveiro.gcode",
  progressPercent: 42.5,
  elapsedSeconds: 1200,
  remainingSeconds: 1600,
  nozzleC: 210,
  nozzleTargetC: 210,
  bedC: 60,
  bedTargetC: 60,
  layer: { current: 12, total: 80 },
  filamentUsedMm: 3400,
  observedAt: iso(1),
};

describe("catálogo de adaptadores", () => {
  it("tem os três conectores previstos e todos exigem o conector local", () => {
    expect(ADAPTER_CATALOG.map((e) => e.id).sort()).toEqual(["bambu", "moonraker", "octoprint"]);
    expect(ADAPTER_CATALOG.every((e) => e.requiresLocalConnector)).toBe(true);
  });

  it("declara todas as capacidades em cada adaptador", () => {
    for (const e of ADAPTER_CATALOG) expect(Object.keys(e.capabilities).sort()).toEqual([...CAPABILITIES].sort());
  });

  it("na Fase 1 nada está verificado e nenhum comando remoto é oferecido", () => {
    for (const e of ADAPTER_CATALOG) {
      expect(Object.values(e.capabilities)).not.toContain("verificado");
      expect(e.status).not.toBe("pronto");
      expect(visibleCapabilities(e).some(isCommand)).toBe(false);
    }
  });

  it("Bambu é somente leitura e experimental", () => {
    const b = catalogEntry("bambu")!;
    expect(b.status).toBe("experimental_nao_verificado");
    for (const c of COMMAND_CAPABILITIES) expect(b.capabilities[c]).toBe("nao_suportado");
    expect(b.capabilities.status).toBe("experimental");
  });

  it("regras de exposição: comando só com suporte verificado; leitura aceita documentado/experimental", () => {
    expect(canOfferCommand("verificado")).toBe(true);
    for (const l of ["documentado", "experimental", "a_confirmar", "nao_suportado"] as const) expect(canOfferCommand(l)).toBe(false);
    expect(canShowReading("experimental")).toBe(true);
    expect(canShowReading("a_confirmar")).toBe(false);
    expect(canShowReading("nao_suportado")).toBe(false);
  });

  it("catalogEntry devolve null para adaptador desconhecido", () => {
    expect(catalogEntry("marlin")).toBeNull();
  });
});

describe("capacidades do adaptador", () => {
  const adapter: Pick<PrinterAdapter, "capabilities" | "execute"> = {
    capabilities: new Set(["status", "pause"] as const),
    execute: async () => undefined,
  };

  it("supports reflete só o que foi declarado", () => {
    expect(supports(adapter, "status")).toBe(true);
    expect(supports(adapter, "cancel")).toBe(false);
  });

  it("recusa comando não declarado ou sem execute", () => {
    expect(() => assertCanExecute(adapter, "pause")).not.toThrow();
    expect(() => assertCanExecute(adapter, "cancel")).toThrow(AdapterError);
    expect(() => assertCanExecute({ capabilities: new Set(["pause"]) }, "pause")).toThrow(AdapterError);
  });
});

describe("telemetria (dados não confiáveis)", () => {
  const ok = { v: 1, printerId: PID, seq: 7, state: baseState };

  it("aceita um envio válido", () => {
    expect(telemetryEnvelopeSchema.safeParse(ok).success).toBe(true);
  });

  it("mantém desconhecido como null, sem inventar", () => {
    const r = telemetryEnvelopeSchema.parse({
      ...ok,
      state: { ...baseState, progressPercent: null, nozzleC: null, layer: null, filamentUsedMm: null, jobName: null },
    });
    expect(r.state.progressPercent).toBeNull();
    expect(r.state.layer).toBeNull();
    expect(r.state.filamentUsedMm).toBeNull();
    expect(r.state.jobName).toBeNull();
  });

  it.each([
    ["progresso acima de 100", { progressPercent: 140 }],
    ["progresso negativo", { progressPercent: -1 }],
    ["temperatura absurda", { nozzleC: 9000 }],
    ["tempo negativo", { elapsedSeconds: -5 }],
    ["estado inventado", { state: "explodindo" }],
    ["NaN", { bedC: Number.NaN }],
    ["data inválida", { observedAt: "ontem" }],
    ["camada fracionada", { layer: { current: 1.5, total: 10 } }],
  ])("rejeita %s", (_nome, patch) => {
    expect(telemetryEnvelopeSchema.safeParse({ ...ok, state: { ...baseState, ...patch } }).success).toBe(false);
  });

  it("rejeita versão desconhecida, id inválido e seq negativo", () => {
    expect(telemetryEnvelopeSchema.safeParse({ ...ok, v: 2 }).success).toBe(false);
    expect(telemetryEnvelopeSchema.safeParse({ ...ok, printerId: "abc" }).success).toBe(false);
    expect(telemetryEnvelopeSchema.safeParse({ ...ok, seq: -1 }).success).toBe(false);
  });

  it("limpa o nome do arquivo (controles e tamanho)", () => {
    const r = telemetryEnvelopeSchema.parse({ ...ok, state: { ...baseState, jobName: `a\u0000b\n${"x".repeat(500)}` } });
    expect(r.state.jobName).not.toMatch(/[\u0000-\u001f]/);
    expect(r.state.jobName!.length).toBeLessThanOrEqual(120);
  });
});

describe("comandos", () => {
  const req = { printerId: PID, command: "pause", confirm: true, key: "chave-1234" };

  it("exige confirmação explícita", () => {
    expect(commandRequestSchema.safeParse(req).success).toBe(true);
    expect(commandRequestSchema.safeParse({ ...req, confirm: false }).success).toBe(false);
    expect(commandRequestSchema.safeParse({ printerId: req.printerId, command: req.command, key: req.key }).success).toBe(false);
  });

  it("só aceita comandos conhecidos", () => {
    expect(commandRequestSchema.safeParse({ ...req, command: "gcode" }).success).toBe(false);
    expect(commandRequestSchema.safeParse({ ...req, command: "reiniciar" }).success).toBe(false);
  });

  it("o pedido expira", () => {
    expect(commandExpired(NOW - (COMMAND_TTL_SECONDS - 1) * 1000, NOW)).toBe(false);
    expect(commandExpired(NOW - (COMMAND_TTL_SECONDS + 1) * 1000, NOW)).toBe(true);
  });
});

describe("dado desatualizado e conexão", () => {
  it("classifica o frescor", () => {
    expect(freshness(iso(2), NOW)).toBe("ao_vivo");
    expect(freshness(iso(45), NOW)).toBe("atrasado");
    expect(freshness(iso(600), NOW)).toBe("desatualizado");
    expect(freshness(null, NOW)).toBe("sem_dados");
    expect(freshness("lixo", NOW)).toBe("sem_dados");
  });

  it("dado velho nunca aparece como conectado", () => {
    expect(connectionIndicator(true, "ao_vivo")).toBe("conectada");
    expect(connectionIndicator(true, "atrasado")).toBe("instavel");
    expect(connectionIndicator(true, "desatualizado")).toBe("sem_sinal");
    expect(connectionIndicator(false, "ao_vivo")).toBe("sem_sinal");
    expect(connectionIndicator(null, "ao_vivo")).toBe("sem_sinal");
  });
});

describe("limite de gravação", () => {
  it("grava a primeira leitura sempre", () => {
    expect(shouldWrite({ changed: false, lastWriteMs: null, nowMs: NOW })).toBe(true);
  });
  it("mudança respeita o intervalo mínimo", () => {
    expect(shouldWrite({ changed: true, lastWriteMs: NOW - (MIN_WRITE_INTERVAL_MS - 1), nowMs: NOW })).toBe(false);
    expect(shouldWrite({ changed: true, lastWriteMs: NOW - MIN_WRITE_INTERVAL_MS, nowMs: NOW })).toBe(true);
  });
  it("sem mudança só grava no batimento", () => {
    expect(shouldWrite({ changed: false, lastWriteMs: NOW - 10_000, nowMs: NOW })).toBe(false);
    expect(shouldWrite({ changed: false, lastWriteMs: NOW - HEARTBEAT_MS, nowMs: NOW })).toBe(true);
  });
  it("relógio que voltou não trava a gravação", () => {
    expect(shouldWrite({ changed: false, lastWriteMs: NOW + 5_000, nowMs: NOW })).toBe(true);
  });
});
