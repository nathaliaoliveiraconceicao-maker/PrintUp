import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (n: number) => brl.format(n);

const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const formatPercent = (n: number) => `${pct.format(n)}%`;

/** Interpreta números digitados em pt-BR ("1.234,56" ou "12,5"); vazio/inválido => NaN. */
export function parseDecimal(value: string | null | undefined): number {
  if (value == null) return NaN;
  const s = String(value).trim().replace(/\s/g, "");
  if (s === "") return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d*\.?\d+$/.test(normalized)) return NaN;
  return Number(normalized);
}

/** Dias inteiros (arredondados para cima) até a data; nunca negativo. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86_400_000));
}
