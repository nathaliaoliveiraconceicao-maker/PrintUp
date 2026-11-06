"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { readPref, setPref, subscribe, type ThemePref } from "@/lib/theme";

const usePref = (): ThemePref => useSyncExternalStore(subscribe, readPref, () => "light");

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Automático", icon: Monitor },
];

/** Botão de ícone: alterna entre claro e escuro (o "Automático" fica em Configurações → Aparência). */
export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const pref = usePref();
  const isDark = pref === "dark" || (pref === "system" && typeof document !== "undefined" && document.documentElement.dataset.theme === "dark");
  const next: ThemePref = isDark ? "light" : "dark";
  const Icon = isDark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      aria-label={isDark ? "Mudar para tela clara" : "Mudar para tela escura"}
      title={isDark ? "Tela clara" : "Tela escura"}
      data-testid="alternar-tema"
      className={cn("inline-flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-paper hover:text-ink", withLabel ? "w-full justify-start" : "w-11", className)}
    >
      <Icon size={18} aria-hidden="true" />
      {withLabel && <span>{isDark ? "Tela clara" : "Tela escura"}</span>}
    </button>
  );
}

/** Escolha completa: claro, escuro ou automático (segue o sistema). */
export function ThemeChoice() {
  const pref = usePref();
  return (
    <div role="radiogroup" aria-label="Tema da tela" className="grid grid-cols-3 gap-2" data-testid="escolha-tema">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          onClick={() => setPref(value)}
          className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors", pref === value ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-surface text-muted hover:text-ink")}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
