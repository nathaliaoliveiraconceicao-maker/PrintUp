export interface SpoolLike {
  id: string;
  filament_id: string | null;
  material: string;
  color: string | null;
  initial_g: number;
  remaining_g: number;
  reserved_g: number;
  status: "nova" | "em_uso" | "vazia" | "descartada";
}
export interface FilamentLike {
  id: string;
  name: string;
  material: string;
  color: string | null;
  min_stock_g: number;
}

export const LOW_SPOOL_RATIO = 0.15;

export interface FilamentStock {
  filament: FilamentLike;
  spools: number;
  remaining: number;
  reserved: number;
  /** Físico − reservado: o que ainda pode ser prometido a novos trabalhos. */
  available: number;
  low: boolean;
  empty: boolean;
}

const usable = (s: SpoolLike) => s.status === "nova" || s.status === "em_uso";

/** Estoque por filamento. "Baixo" = disponível abaixo do mínimo configurado (ou sem bobina utilizável). */
export function stockByFilament(filaments: FilamentLike[], spools: SpoolLike[]): FilamentStock[] {
  return filaments.map((f) => {
    const mine = spools.filter((s) => s.filament_id === f.id && usable(s));
    const remaining = mine.reduce((a, s) => a + s.remaining_g, 0);
    const reserved = mine.reduce((a, s) => a + s.reserved_g, 0);
    const available = remaining - reserved;
    return { filament: f, spools: mine.length, remaining, reserved, available, low: available <= f.min_stock_g, empty: mine.length === 0 || remaining <= 0 };
  });
}

/** Bobina quase no fim (pouco material em relação ao peso inicial). */
export const isSpoolLow = (s: SpoolLike): boolean => usable(s) && s.remaining_g / s.initial_g <= LOW_SPOOL_RATIO;
/** Reservado acima do que existe: acontece quando uma falha ou um consumo maior consome material já prometido. */
export const isOverCommitted = (s: SpoolLike): boolean => s.reserved_g > s.remaining_g + 1e-9;
